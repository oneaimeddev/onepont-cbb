# ADR-012 — Rascunhos de documentos médicos

**Status:** aceita  
**Data:** 16/11/2026

## Decisão

Prescrições e pedidos cirúrgicos nascem como rascunhos internos em `clinical.documents`, distinguidos por tipo e validados dentro da função que os grava. O autor é `auth.uid()`. O rascunho permanece visível apenas para esse autor.

A permissão para criar ou alterar esses documentos é a linha habilitada em `clinical.medical_authors`, somada ao vínculo de leitura do atleta. `profiles.profession` não autoriza. A própria pessoa não concede a capacidade a si mesma: a concessão exige `can_manage_access` e outro usuário. Administrar acessos não abre o conteúdo clínico.

Nesta fase os estados são somente `draft` e `ready_for_review`. Não há emissão, assinatura nem compartilhamento externo. A auditoria registra a operação, o ator, o atleta e o documento, sem o conteúdo clínico, na mesma transação da alteração.

## Consequências

- Uma ferramenta futura do agente precisa chamar estas mesmas funções. Ela não recebe um caminho próprio para emitir ou assinar.
- A habilitação de demonstração não valida CRM, credencial ou situação profissional.
- Revisão interna não transforma o rascunho em documento legal.
