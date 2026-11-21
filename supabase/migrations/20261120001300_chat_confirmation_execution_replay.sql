-- Confirmation plus receipt consumption; replay of the same captured input
-- returns its native execution instead of rechecking a pre-save review version.
create function public.chat_operation_confirm_execute(session_id uuid,challenge_id uuid,nonce uuid,input_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a clinical.chat_operation_authorizations;r jsonb;e jsonb;begin
 if not clinical.chat_operation_session(auth.uid(),session_id) then return '{"error":"denied"}';end if;
 select proof.* into a from clinical.chat_operation_authorizations proof
 join clinical.chat_operation_challenges c on c.id=proof.challenge_id
 join clinical.chat_human_inputs i on i.id=proof.input_id
 where proof.professional_id=auth.uid() and proof.session_id=chat_operation_confirm_execute.session_id
 and c.id=chat_operation_confirm_execute.challenge_id and c.nonce=chat_operation_confirm_execute.nonce and c.phase='confirmed'
 and i.id=chat_operation_confirm_execute.input_id and i.professional_id=auth.uid() and i.session_id=proof.session_id and i.challenge_id=c.id and i.outcome='accepted';
 if a.id is not null then r:=jsonb_build_object('authorizationId',a.id,'effect','authorization_recorded','executionEnabled',false);
 else r:=public.chat_operation_confirm(session_id,challenge_id,nonce,input_id);end if;
 if r ? 'error' or r->>'authorizationId' is null then return r;end if;
 e:=public.chat_operation_execute((r->>'authorizationId')::uuid);
 return r||jsonb_build_object('execution',e)||case when e ? 'error' then jsonb_build_object('error',e->>'error') else '{}'::jsonb end;
end $$;
revoke all on function public.chat_operation_confirm_execute(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.chat_operation_confirm_execute(uuid,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
