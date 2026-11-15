# HANDOFF 001 — Implementar a primeira vertical funcional do Prontuário CBB

**Para:** Cursor / Claude Code / agente de desenvolvimento  
**Prioridade:** P0  
**Prazo-alvo de integração interna:** terça-feira, 17/11/2026  
**Material obrigatório:** `PRD-0.1.md`, `ARQUITETURA-0.1.md`, `BACKLOG-0.1.md`.

## Papel e objetivo

Atue como engenheiro full-stack sênior responsável por transformar o PRD em uma aplicação web demonstrável e com persistência real. O resultado deve executar a **jornada ponta a ponta**: login → chat inicial → localizar atleta → abrir prontuário tradicional com transição → preparar evolução pelo agente → revisão/aprovação humana → persistir → visualizar na timeline → consultar auditoria, distinguindo UI tradicional e agente.

**Não entregue apenas telas de aparência convincente.** Cada ação crítica deve ter backend, persistência, validação e testes. Use exclusivamente dados sintéticos. Não crie fake logs ou uma auditoria com valores hardcoded.

## Antes de codificar

1. Inspecione o repositório e identifique se já existe aplicação/stack; não destrua arquivos existentes.
2. Leia os 3 documentos, liste decisões já dadas, hipóteses e o plano de implementação em etapas pequenas.
3. Prefira Next.js App Router + TypeScript + Tailwind + shadcn/ui, Supabase Auth/Postgres/Storage, Vercel AI SDK, mas preserve o que já existir se equivalente e confiável. Documente desvio.
4. Verifique APIs atuais nas docs oficiais, instale dependências estáveis com lockfile, configure `.env.example` sem segredos.
5. Não crie funcionalidades de fora do corte só porque aparecem no PRD futuro.

**Regra de execução incremental:** entregue as Fases A → B → C → D → E em commits ou checkpoints separados. Ao término de cada fase rode as verificações pertinentes e reporte bloqueios; não avance mascarando erros. A auditoria (Fase C) deve acompanhar as mutações da Fase B, sem criar uma dívida técnica temporária.

## Fase A — Fundação, identidade e autenticação

- Estruturar `src/app`, `src/components`, `src/features`, `src/lib` (ou organização equivalente), `supabase/migrations`, `tests`.
- Aplicar logotipo CBB real (se ativo oficial estiver disponível no repositório/fornecido) e paleta compatível; se arquivo estiver indisponível, usar placeholder **claramente identificado**, sem inventar escudo, e relatar o bloqueio.
- Criar layout responsivo com shell persistente, Chat-first e interface tradicional com sidebar.
- `Chat-first`: caixa de texto central, cards `Buscar atleta`, `Nova evolução`, `Prontuários` e `Auditoria` (visível apenas a quem pode consultar).
- Implementar Supabase Auth com sessão verificada no servidor, login/logout e perfil individual. Nada de contas compartilhadas.

**Aceite da Fase A:** duas interfaces navegam com login e logout; acesso não autenticado é negado no backend, não só redirecionado no frontend.

## Fase B — Domínio e segurança

- Criar migrations versionadas para `profiles`, `professionals`, `athletes`, `teams`, `call_ups`, `call_up_athletes`, `professional_assignments`, `encounters`, `clinical_entries`, `conversations` e `audit_events` (adaptar semântica e reduzir tabelas apenas se justificar no README).
- Criar constraints FK, índices em atleta/profissional/data, estados de evolução e classificação de sensibilidade.
- Criar RLS/grants e funções seguras para autorização. Associar atores às claims verificadas da sessão; nunca confiar em `actorUserId` recebido do cliente/LLM.
- Criar script de seed com atletas e dados fictícios marcados como `DEMO`; não inventar pessoas reais nem CPFs de terceiros. Perfis de teste em Supabase Auth devem ser criados por rotina segura para ambiente local/staging, nunca com senha fixa em código commitado.
- Implementar serviço de domínio para busca de atleta, ficha, histórico, criar rascunho e confirmar evolução.
- Não permitir editar silenciosamente uma evolução `finalized`.

**Aceite da Fase B:** fluxo tradicional funciona com dados persistidos, permissão positiva e negativa testadas, inclusive registro psicológico restrito.

## Fase C — Auditoria (implementar junto das operações, não depois)

Implementar `audit_events` com pelo menos:

- `actor_user_id`, `actor_professional_id` (opcional), `operation`, `resource_type`, `resource_id`, `athlete_id` (quando aplicável), `occurred_at`.
- `origin_channel`: `traditional_ui`, `ai_chat`, `ai_voice`, `system`.
- `execution_method`: `human_ui`, `agent_tool`, `system`.
- `outcome`: `success`, `denied`, `failed`.
- `request_id`, `conversation_id`, `approval_id`, `approved_by_user_id`, `changed_fields` e `safe_metadata` minimizada.

Regras:

- Eventos **somente acréscimo** e não editáveis pelo cliente.
- Gravação de evento e mutação clínica na mesma transação no servidor quando possível; não confirmar sucesso se não houver trilha correspondente.
- Logar leitura de prontuário, geração de rascunho, confirmação, acesso negado e alterações de vínculo.
- Para voz, preservar `origin_channel=ai_voice` mesmo quando a confirmação ocorrer pelo modal da UI.
- Evitar payloads clínicos, prompts brutos, segredos ou dados pessoais desnecessários nos metadados.
- Criar página `/audit` (ou equivalente) consultável apenas por papel autorizado, com filtros por ação, usuário, origem e data. Se admin operacional não pode ler conteúdo clínico, não exibir dados sensíveis nessa tela.

**Aceite da Fase C:** visualização e mutação na UI e por agente são distinguíveis; confirmação humana é rastreável; acesso negado gera evento sanitizado.

## Fase D — Agente, aprovação e navegação fluida

Implementar chat com LLM real (provedor configurável) por AI SDK e **somente** ferramentas explicitamente declaradas:

```ts
searchAthletes({ query, teamId? })
getAthleteSummary({ athleteId })
getClinicalTimeline({ athleteId, limit? })
prepareClinicalEntryDraft({ athleteId, clinicianText })
navigateTo({ view, athleteId? })
```

- Tools precisam chamar serviços de domínio com contexto de sessão. LLM não cria SQL, URLs arbitrárias ou códigos executáveis.
- Modelo retorna respostas estruturadas e componentes ricos (cards de atleta, pré-visualização de rascunho).
- Pedidos como "Abra o prontuário de João" retornam intenção estruturada, que altera a UI com transição leve **sem perder conversa, atleta ativo ou rascunho**.
- O agente pode criar **rascunho**, não finalizar evolução. Uma tela/modal de revisão deve permitir edição e exigir clique de confirmação do usuário autorizado.
- Endpoint de confirmação deve validar sessão, autorização, estado, versão e idempotência; gravar auditoria de modo correlacionado.
- Falha do provedor LLM deve mostrar erro recuperável; fluxo tradicional permanece disponível.
- Proteger contra prompt injection em texto de paciente/anexo: textos clínicos são dados, não instruções para ferramentas.

**Aceite da Fase D:** via chat, uma evolução real chega ao banco e à timeline somente após confirmação explícita; trilha aponta `origin_channel=ai_chat`, executor e autor humano. Trocar de modo mantém estado.

## Fase E — Verificação e apresentação

Criar testes automatizados, no mínimo:

1. Login exigido em endpoints clínicos e auditoria.
2. Profissional autorizado acessa atleta em seu vínculo.
3. Profissional sem vínculo não acessa atleta/registro e recebe 403/404 não revelador.
4. Registro restrito à psicologia não aparece em histórico, tool nem busca de não autorizados.
5. Rascunho gerado pelo agente não aparece como finalizado.
6. Confirmação gera uma única entrada (teste de duplicidade/retry) e evento de auditoria com aprovação.
7. UI tradicional e IA geram origens distintas na auditoria.
8. Comando de navegação mantém `activeAthleteId` e conversa ativa.
9. Consulta auditoria sem permissão é negada.
10. Logs e eventos não armazenam prompts completos ou conteúdo clínico sensível.

Executar e registrar: lint, typecheck, testes e build. Configurar staging separado de produção (env e banco), com dados fictícios. Elaborar roteiro de demo de 5–7 minutos.

## Não fazer neste handoff

- Não integrar Bird ID, Soluti, SNCR ou Anvisa.
- Não gerar receitas médicas reais nem documentos com afirmação de assinatura válida.
- Não construir um agente autônomo que prescreve, diagnostica ou assina sem humano.
- Não criar white-label, multi-organização comercial ou dashboard avançado.
- Não usar dados de pacientes verdadeiros, nem em logs/prompts de serviços terceirizados.
- Não interromper o fluxo principal para implementar campos de especialidades secundárias.

## Como reportar a entrega

Ao finalizar, responda com:

1. **Resumo do que foi implementado** e o que está realmente funcional.
2. **Arquivos/migrations alterados** e decisões arquiteturais adotadas.
3. **Comandos executados** + resultado de lint/typecheck/test/build.
4. **Tabela requisito → evidência** (URL, teste ou arquivo) para itens P0.
5. **Riscos/pendências** da demonstração, explicitando ausências (voz, logo oficial, provider de IA, staging, etc.).
6. **Passo a passo para rodar no WSL/Ubuntu (bash)**, sem incluir valores secretos.

### Definição de pronto (DoD)

A versão é considerada demonstrável **somente** se um usuário logado puder localizar atleta, transitar do chat para o prontuário, preparar e confirmar uma evolução, encontrar o registro persistido e visualizar trilha de auditoria verdadeira correspondente; e se os testes de autorização conhecidos passarem. Sem atalhos que simulam persistência ou autorização no navegador.

---

**Ordem de prioridade ao enfrentar prazo:** `auth/permissões + domínio + auditoria + chat tool + revisão + transição` > polimento > voz > anexos > integrações externas.
