-- The router and the transactional save share the same handling of spoken prefixes.
create or replace function public.chat_document_save_directive(utterance text)
returns text language plpgsql immutable strict security invoker set search_path='' as $$
declare clean text;
begin
 if length(utterance) not between 1 and 240 then return null;end if;
 clean:=translate(lower(regexp_replace(btrim(utterance),'[[:space:]]+',' ','g')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc');
 -- Discard only leading conversational acknowledgements. Keep the rest
 -- intact so questions, conditions and interrupted instructions are rejected.
 clean:=regexp_replace(clean,'^((ta bom|ta|perfeito|certo|ok|tudo bem)[[:space:],.!]+)+','');
 clean:=regexp_replace(clean,'[.!]+$','');
 if clean ~ '^(pode |quero |vamos )?((confirme|confirmar) e )?(salve|salvar|grave|gravar)\M' then return clean;end if;
 return null;
end $$;
