# ADR-010 — Preservar a fronteira clínica no PostgreSQL

**Status:** aceita  
**Data:** 15/11/2026

## Decisão

O prontuário continua com Next.js, Supabase Auth e as funções PostgreSQL `security definer` já existentes. Esta fase não introduz camadas novas de domínio, orquestração ou agente.

Autorização, vínculo profissional e auditoria permanecem dentro das funções. O identificador de quem age é `auth.uid()`. O cliente não envia um ator.

## Consequências

- A Home CBB Intelligence fica em `/`, com o compositor desligado. Atletas, prontuários, evoluções e auditoria continuam na interface tradicional.
- O acesso de um segundo profissional usa `clinical.athlete_access`. A concessão exige `profiles.can_manage_access`, não pode ser feita para si mesmo e não entrega prontuário a quem administra.
- O pacote concedido é fixo: leitura, evolução e finalização das próprias notas. Edição cadastral fica de fora.
- Um registro `author_only` não volta a `care_team` por checkbox nem por chamada direta. A profissão em texto livre não classifica psicologia.
- Não há agente, ferramenta de IA, compartilhamento excepcional nem acesso emergencial nesta fase.
