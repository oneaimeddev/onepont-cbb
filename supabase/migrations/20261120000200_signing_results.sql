-- Durable demonstration evidence; deliberately no cryptographic artifact is manufactured.
create table clinical.signature_results (
 attempt_id uuid primary key references clinical.signature_attempts(id),
 snapshot_id uuid not null references clinical.signature_snapshots(id),
 document_version integer not null, content_hash text not null,
 outcome text not null, simulated boolean not null default true check(simulated),
 cryptographically_signed boolean not null default false check(not cryptographically_signed),
 certificate_verified boolean not null default false check(not certificate_verified),
 artifact_id uuid, evidence jsonb not null,
 created_at timestamptz not null default clock_timestamp(), check(artifact_id is null)
);
-- Reserved private artifact catalog. No writer/reader API until a real connector and validator are approved.
create table clinical.signature_artifacts (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references clinical.signature_attempts(id),
 provenance text not null check(provenance in ('production','test_only')),
 object_path text not null, content_hash text not null, mime_type text not null,
 byte_length bigint not null check(byte_length>0), validated boolean not null default false,
 check(not validated or provenance='production')
);
alter table clinical.signature_results enable row level security;
alter table clinical.signature_artifacts enable row level security;
revoke all on clinical.signature_results,clinical.signature_artifacts from public,anon,authenticated;
create function clinical.record_signature_result() returns trigger language plpgsql security definer set search_path='' as $$
declare s clinical.signature_snapshots;
begin
 if new.state not in ('authorizing','processing') and new.state is distinct from old.state then
  select * into s from clinical.signature_snapshots where id=new.snapshot_id;
  insert into clinical.signature_results(attempt_id,snapshot_id,document_version,content_hash,outcome,evidence)
  values(new.id,s.id,s.version,s.content_hash,new.state,jsonb_build_object('adapter','demo-v1','simulated',true,'cryptographic_validation','not_performed','certificate_verification','not_performed','artifact','not_generated'))
  on conflict(attempt_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function clinical.record_signature_result() from public,anon,authenticated;
create trigger record_signature_result after update on clinical.signature_attempts for each row execute function clinical.record_signature_result();
