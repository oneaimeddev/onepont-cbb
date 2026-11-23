create function public.consultation_expired_audio() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(expired.name), array[]::text[])
  from (
    select o.name
    from storage.objects o
    join clinical.consultation_sessions s on s.id::text = split_part(o.name, '/', 1)
    where o.bucket_id = 'consultation-audio' and s.audio_expires_at <= now()
    order by o.name limit 100
  ) expired;
$$;
revoke all on function public.consultation_expired_audio() from public, anon, authenticated;
grant execute on function public.consultation_expired_audio() to service_role;
notify pgrst, 'reload schema';
