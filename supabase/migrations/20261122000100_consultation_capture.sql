-- Synthetic consultations only. No direct access to session data or objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consultation-audio', 'consultation-audio', false, 2097152, array['audio/wav']);

create policy consultation_audio_private on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'consultation-audio')
with check (bucket_id <> 'consultation-audio');

create table clinical.consultation_sessions (
  id uuid primary key,
  athlete_id uuid not null references clinical.athletes(id),
  professional_id uuid not null references public.profiles(id),
  specialty text not null,
  authorization_basis text not null check (authorization_basis = 'staged_fictional_v1'),
  created_at timestamptz not null default now(),
  audio_expires_at timestamptz not null default (now() + interval '7 days'),
  capture_state text not null default 'recording'
    check (capture_state in ('recording', 'complete', 'partial')),
  expected_segments integer check (expected_segments between 1 and 3600),
  processing_state text not null default 'pending'
    check (processing_state in ('pending', 'transcribing', 'generating', 'ready', 'failed')),
  transcript text,
  generated_body text,
  processing_attempts integer not null default 0,
  processing_error text,
  evolution_id uuid unique references clinical.records(id)
);

create unique index consultation_one_open_capture
on clinical.consultation_sessions (professional_id, athlete_id)
where capture_state = 'recording';

create table clinical.consultation_segments (
  session_id uuid not null references clinical.consultation_sessions(id) on delete cascade,
  sequence integer not null check (sequence between 0 and 3599),
  duration_ms integer not null check (duration_ms between 1 and 60000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  stored_at timestamptz not null default now(),
  transcript text,
  primary key (session_id, sequence)
);

alter table clinical.consultation_sessions enable row level security;
alter table clinical.consultation_segments enable row level security;
revoke all on clinical.consultation_sessions, clinical.consultation_segments from public, anon, authenticated;

create function clinical.consultation_specialty(actor uuid) returns text
language sql stable set search_path = '' as $$
  select case trim(profession)
    when 'Medicina Esportiva' then 'Medicina'
    when 'Fisioterapia Esportiva' then 'Fisioterapia'
    when 'Nutrição Esportiva' then 'Nutrição'
    when 'Psicologia Esportiva' then 'Psicologia'
    when 'Medicina' then 'Medicina'
    when 'Enfermagem' then 'Enfermagem'
    when 'Fisioterapia' then 'Fisioterapia'
    when 'Nutrição' then 'Nutrição'
    when 'Psicologia' then 'Psicologia'
  end from public.profiles where id = actor;
$$;
revoke all on function clinical.consultation_specialty(uuid) from public, anon, authenticated;

create function public.consultation_capture(
  target uuid, session_id uuid, operation text, authorization_code text default null,
  segment_number integer default null, segment_duration integer default null,
  segment_hash text default null, segment_count integer default null,
  interrupted boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  specialty_name text;
  capture clinical.consultation_sessions;
  segment clinical.consultation_segments;
  received integer;
  last_segment integer;
begin
  specialty_name := clinical.consultation_specialty(actor);
  if specialty_name is null or not exists (
    select 1 from clinical.athlete_access a
    join clinical.athletes t on t.id = a.athlete_id and t.source = 'demo'
    where a.athlete_id = target and a.professional_id = actor and a.can_read_records and a.can_write
  ) then return '{"error":"denied"}'; end if;

  if operation = 'start' then
    if session_id is null or authorization_code is distinct from 'staged_fictional_v1' then
      return '{"error":"invalid"}';
    end if;
    insert into clinical.consultation_sessions (id, athlete_id, professional_id, specialty, authorization_basis)
    values (session_id, target, actor, specialty_name, authorization_code)
    on conflict do nothing;
  end if;

  select * into capture from clinical.consultation_sessions s
  where s.athlete_id = target and s.professional_id = actor and s.specialty = specialty_name
    and (s.id = session_id or (operation = 'start' and s.capture_state = 'recording'))
  order by (s.id = session_id) desc limit 1 for update;
  if capture.id is null then return '{"error":"unavailable"}'; end if;

  if operation = 'confirm' then
    if segment_number is null or segment_number not between 0 and 3599
      or segment_duration is null or segment_duration not between 1 and 60000
      or segment_hash is null or segment_hash !~ '^[0-9a-f]{64}$' then
      return '{"error":"invalid"}';
    end if;
    select * into segment from clinical.consultation_segments d
    where d.session_id = capture.id and d.sequence = segment_number;
    if found then
      if segment.sha256 is distinct from segment_hash or segment.duration_ms is distinct from segment_duration then
        return '{"error":"conflict"}';
      end if;
    else
      if capture.capture_state <> 'recording' or capture.audio_expires_at <= now()
        or not exists (
          select 1 from storage.objects o where o.bucket_id = 'consultation-audio'
          and o.name = capture.id::text || '/' || segment_number::text || '-' || segment_hash || '.wav'
        ) then return '{"error":"unavailable"}'; end if;
      insert into clinical.consultation_segments (session_id, sequence, duration_ms, sha256)
      values (capture.id, segment_number, segment_duration, segment_hash);
    end if;
  end if;

  select count(*), max(d.sequence) into received, last_segment
  from clinical.consultation_segments d where d.session_id = capture.id;

  if operation = 'finish' then
    if segment_count is null or segment_count not between 0 and 3600
      or (segment_count = 0 and interrupted is not true) then return '{"error":"invalid"}'; end if;
    if capture.capture_state = 'recording' then
      if interrupted is false and (received <> segment_count or last_segment <> segment_count - 1) then
        return '{"error":"missing_segments"}';
      end if;
      update clinical.consultation_sessions
      set expected_segments = nullif(segment_count, 0),
          capture_state = case when interrupted is false then 'complete' else 'partial' end
      where id = capture.id returning * into capture;
    elsif capture.expected_segments is distinct from nullif(segment_count, 0)
      or (capture.capture_state = 'partial') is distinct from (interrupted is not false) then
      return '{"error":"conflict"}';
    end if;
  elsif operation not in ('start', 'confirm', 'status') or operation is null then
    return '{"error":"invalid"}';
  end if;

  return jsonb_build_object(
    'id', capture.id, 'state', capture.capture_state, 'received', received,
    'lastSegment', last_segment, 'expiresAt', capture.audio_expires_at
  );
end;
$$;
revoke all on function public.consultation_capture(uuid,uuid,text,text,integer,integer,text,integer,boolean)
  from public, anon, authenticated;
grant execute on function public.consultation_capture(uuid,uuid,text,text,integer,integer,text,integer,boolean)
  to authenticated;

notify pgrst, 'reload schema';
