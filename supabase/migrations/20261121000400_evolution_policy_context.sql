-- Policy is resolved for the professional even on a clean Home without athlete context.
create function public.evolution_policy() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise insufficient_privilege;end if;
 return jsonb_build_object('psychology_required',clinical.psychology_required(auth.uid()));
end $$;
revoke all on function public.evolution_policy() from public,anon,authenticated;
grant execute on function public.evolution_policy() to authenticated;
notify pgrst,'reload schema';
