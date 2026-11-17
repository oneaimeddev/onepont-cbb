-- Resume a previous conversation and label the recent list with the first question.

create or replace function public.conversation_recent() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare rows jsonb;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  perform clinical.conversation_idle_stale(actor);
  select coalesce(jsonb_agg(item order by item->>'lastActivityAt' desc), '[]'::jsonb) into rows
  from (
    select jsonb_build_object(
      'id', session.id,
      'status', session.status,
      'athleteId', case when access.athlete_id is not null then session.athlete_id else null end,
      'athleteName', case when access.athlete_id is not null then coalesce(athlete.social_name, athlete.full_name) else null end,
      'startedAt', session.started_at,
      'lastActivityAt', session.last_activity_at,
      'messageCount', (select count(*) from clinical.conversation_messages message where message.session_id = session.id),
      'preview', coalesce(
        (select left(regexp_replace(trim(message.text), '[[:space:]]+', ' ', 'g'), 72)
         from clinical.conversation_messages message
         where message.session_id = session.id and message.role = 'user' and trim(message.text) <> ''
         order by message.position
         limit 1),
        case when access.athlete_id is not null then coalesce(athlete.social_name, athlete.full_name) else null end
      )
    ) as item
    from clinical.conversation_sessions session
    left join clinical.athlete_access access
      on access.athlete_id = session.athlete_id and access.professional_id = actor
    left join clinical.athletes athlete on athlete.id = access.athlete_id
    where session.professional_id = actor
      and session.status <> 'archived'
      and exists (
        select 1 from clinical.conversation_messages message
        where message.session_id = session.id and trim(message.text) <> ''
      )
    order by session.last_activity_at desc
    limit 20
  ) listed;
  return jsonb_build_object('ok', true, 'sessions', rows);
end
$$;

create function public.conversation_resume(target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare session_row clinical.conversation_sessions;
declare previous record;
begin
  if not exists (select 1 from public.profiles where id = actor) then raise insufficient_privilege; end if;
  select * into session_row from clinical.conversation_sessions
  where id = target and professional_id = actor;
  if session_row.id is null then
    perform clinical.conversation_audit(actor, target, null, 'conversation.resume', 'denied');
    return jsonb_build_object('ok', false, 'error', 'denied');
  end if;
  if session_row.status = 'archived' then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  for previous in
    update clinical.conversation_sessions
    set status = 'closed', closed_at = clock_timestamp()
    where professional_id = actor and status = 'active' and id <> session_row.id
    returning id, athlete_id
  loop
    perform clinical.conversation_audit(actor, previous.id, previous.athlete_id, 'conversation.close', 'success');
  end loop;

  update clinical.conversation_sessions
  set status = 'active', closed_at = null, last_activity_at = clock_timestamp()
  where id = session_row.id
  returning * into session_row;
  perform clinical.conversation_audit(actor, session_row.id, session_row.athlete_id, 'conversation.resume', 'success');
  return clinical.conversation_payload(session_row);
end
$$;

revoke all on function public.conversation_resume(uuid) from public, anon, authenticated;
grant execute on function public.conversation_resume(uuid), public.conversation_recent() to authenticated;
