# Backlog 0.1 — Prontuário CBB | entrega interna de 17/11/2026

**Critério de corte:** uma jornada Chat-first / UI tradicional com dado persistente, aprovação clínica e auditoria de ponta a ponta tem precedência sobre recursos isolados de exibição.

## Prioridade P0 (sem isso a demo não está pronta)

| Ordem | Item | Aceite resumido | Dependência |
|---|---|---|---|
| 01 | Repo, bootstrap, qualidade e env | Dev server, lint, typecheck e build; staging com env isolado | nenhuma |
| 02 | Branding CBB + shell da aplicação | Chat inicial, cards, sidebar e tema responsivos | 01 |
| 03 | Auth e identidade profissional | Login/logout; perfil individual com profissão; sem credencial compartilhada | 01 |
| 04 | Schema/Migrations + RLS + dados sintéticos | Atletas, times, vínculos, entradas, auditoria; testes de acesso | 01,03 |
| 05 | Domínio: buscar atleta/consultar histórico | APIs e UI tradicional, com autorização de servidor | 04 |
| 06 | Rascunho/revisão/confirmação de evolução | Registros persistentes e sem finalização automática | 04,05 |
| 07 | Auditoria append-only desde o backend | Evento em consulta, rascunho e confirmação, com origem/correlação | 04,05,06 |
| 08 | Chat com LLM real e ferramentas permitidas | Busca, histórico, rascunho e navegação via chat | 05,06,07 |
| 09 | Transição chat ↔ UI e persistência do contexto | Abre atleta correto sem perder conversa e rascunho | 02,08 |
| 10 | Homologação e roteiro da demo | Testes positivos/negativos, 5–7 minutos, deploy de staging | todos |

**Item 07 deve ser implementado em paralelo às operações 05/06; não deixá-lo para o final.**

## Prioridade P1 (para a apresentação de 23/11, após P0 estável)

- Entrada de voz/transcrição com revisão e auditoria `ai_voice`.
- Ficha profissional mais completa e personalização por profissão.
- Upload de anexos em storage privado e acesso autorizado.
- Exportação de avaliação/relatório simples.
- Painel contextual do chat na interface tradicional com acabamento visual.
- Refinamento da auditoria: filtros e exportação permitida de metadados.

## Prioridade P2 (não bloquear a demonstração)

- Modelos especializados de prescrições, pedidos de exames/cirurgias, atestados e relatórios.
- Bird ID/Soluti, assinatura ICP-Brasil, integração regulatória pertinente (inclusive SNCR quando aplicável).
- Regras detalhadas de responsáveis legais, consentimentos e gestão de documentos reais.
- Formulação específica de nutrição, psicologia, fisioterapia e preparação física.
- Integração com sistema do preparador físico.
- Sistema white-label, analytics avançado e IA preditiva.

## Sequência por dia (metas internas, sem garantia de conclusão)

### Sábado 14/11
- Bootstrap, estrutura modular, banco local/remoto de demo, tema CBB e esqueleto das duas interfaces.
- Criar tipos e contratos de auditoria **antes** dos primeiros endpoints clínicos.

### Domingo 15/11
- Auth, perfis, vínculos, cadastro e ficha do atleta, histórico e escrita autorizada.
- Auditoria de leitura/mutação funcionando; testes de permissões.

### Segunda 16/11
- AI SDK, ferramentas autorizadas, rascunho de evolução, confirmação explícita.
- Navegação entre interfaces com contexto preservado.

### Terça 17/11
- Corrigir bloqueadores, validar cenários, executar testes, deploy de staging e ensaio.

### Quarta 18/11 a domingo 22/11
- Estabilização, voz, anexos/exportações se viáveis, polimento e roteiro de apresentação.

### Segunda 23/11
- Apresentação a Carlos Vicente Andreoli com dados fictícios.

## Roteiro sugerido da demo (5–7 minutos)

1. Login de médico e landing chat com marca CBB.
2. Pergunta sobre atletas de uma seleção; agente devolve resultados reais do banco de demo.
3. Comando de abrir atleta -> transição para prontuário.
4. Registro via chat; IA gera rascunho editável com achados fornecidos.
5. Médico confirma -> entrada surge na timeline.
6. Auditoria mostra consulta, preparação e confirmação, responsável e origem `ai_chat`.
7. Troca de perfil ou ação negada mostra isolamento de permissão.
8. Fechamento: mostrar claramente módulos/integradores planejados, sem alegar integração já concluída.

## Critérios de 'não pronto'

- O chatbot apenas simula operações sem uso real de API/domínio.
- O botão de salvar grava sem aprovação do médico.
- Um usuário não autorizado consegue ler informações via API/agent.
- Operação clínica não é auditada ou não revela origem.
- A transição entre modos reinicia conversa ou perde atleta.
- A apresentação depende de informação clínica real ou dados identificáveis.
