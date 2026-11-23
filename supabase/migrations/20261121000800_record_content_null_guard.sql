-- A historical restricted record may have no author. SQL NULL must deny access,
-- including PL/pgSQL callers that use IF NOT record_content_allowed(...).
create or replace function clinical.record_content_allowed(actor uuid,r clinical.records)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
 exists(select 1 from clinical.athlete_access a where a.professional_id=actor and a.athlete_id=r.athlete_id and a.can_read_records)
 and (r.author_id=actor or exists(select 1 from clinical.record_permissions p where p.record_id=r.id and p.professional_id=actor and p.can_read)
 or (r.status='finalized' and not clinical.record_confidential(r))), false)
$$;
revoke all on function clinical.record_content_allowed(uuid,clinical.records) from public,anon,authenticated;
