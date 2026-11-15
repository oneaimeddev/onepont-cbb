# PRD 0.1 — Prontuário CBB | MVP Plus

**Status:** Baseline para desenvolvimento; hipóteses clínicas ainda sujeitas à validação de profissionais.  
**Data:** 14/11/2026  
**Dono técnico/produto:** equipe do projeto Prontuário CBB  
**Stakeholder de referência:** Carlos Vicente Andreoli

## 1. Resumo executivo

Plataforma de prontuário longitudinal e multidisciplinar para atletas das seleções brasileiras de basquete, categorias de base e adulto, masculino e feminino. O produto é **AI-first, Chat-first, CBB-first**. O profissional poderá executar jornadas clínicas por voz ou texto e alternar visualmente para uma interface convencional sem perder conversa, atleta em foco ou rascunhos.

A primeira versão se destina à **demonstração com dados fictícios**. A prontidão para tratamento de dados clínicos reais depende de validações adicionais de privacidade, segurança, responsabilidades e requisitos profissionais/regulatórios.

## 2. Problema e resultado desejado

**Problema:** a documentação de atendimentos de diferentes profissionais durante convocações não deve depender de processos administrativos ou fluxos de agenda. O contexto do atleta precisa ser recuperável rapidamente e o registro deve ser simples, preservando histórico, sigilo, autoria e rastreabilidade.

**Resultado:** um profissional autenticado localiza um atleta, consulta seu histórico permitido, descreve um atendimento em linguagem natural, revisa uma evolução estruturada, salva o registro e o encontra imediatamente no prontuário. A operação aparece na auditoria, com origem de interação identificada.

## 3. Fontes e grau de certeza

### Pedido explícito do stakeholder na reunião de 11/11

- Registro simples de atendimentos e evolução diária; sem agendamento ou gestão financeira no escopo inicial.
- Cadastro prévio de atleta, reutilizado pelas profissões; nome, CPF, e-mail e telefone foram citados como exemplos de dados básicos.
- Categorias de base e adulta, masculino/feminino; estimativa indicativa de 300–400 atletas/ano e máximo aproximado de 500 no início.
- Histórico por atleta, anexação de exames, impressão/arquivo de avaliações.
- Logins individuais por profissional; sigilo especial para psicologia.
- Interesse em gravação/voz, emissão de prescrições/pedidos e assinatura digital; detalhes e fornecedores em aberto.
- Necessidade de conversar com preparador físico sobre sistema/integração existente.

### Decisões da equipe posteriores à reunião (já acordadas)

- MVP **Plus**, não apenas cadastro e formulário; IA faz parte da primeira jornada.
- Chat como **tela inicial** com input central, cards relevantes e experiência familiar ao padrão dos assistentes conversacionais.
- Interface tradicional com navegação e páginas; transições pela UI ou por comando de texto/voz, preservando estado.
- Branding oficial CBB desde o início. White-label fora do escopo.
- Auditoria demonstrável desde a primeira entrega, inclusive diferenciação de UI, agente/chat e agente/voz.
- Primeira versão interna até **17/11/2026**; apresentação a Carlos em **23/11/2026**.
- Integrações de certificado digital e sistemas regulatórios desacopladas da preparação e revisão dos documentos; fornecedor não decidido.

### Propostas de produto que ainda exigem validação

- Catálogo exato de exames, relatórios, pedidos e documentos por profissão.
- Permissões detalhadas de visualização multidisciplinar e regras de liberação temporária.
- Modelos de avaliação de fisioterapia, nutrição, psicologia e educação física.
- Governança de dados de menores e documentos de responsáveis.
- Necessidade e formato de integração com a solução do preparador físico.

## 4. Princípios não negociáveis

1. **Athlete-first:** uma identidade longitudinal de atleta; convocações e categorias como associações históricas.
2. **AI-first + dual interface:** chat e UI tradicional utilizam as mesmas operações de domínio.
3. **Humano no controle:** IA pode consultar e preparar; mutações clínicas finalizadas exigem ação/revisão explícita de profissional autorizado.
4. **Permissões em profundidade:** a autorização deve valer na API, no banco e nas ferramentas da IA, não apenas na UI.
5. **Auditabilidade desde o início:** registrar leitura relevante, criação, confirmação, alterações, negações e origem da operação.
6. **Sem exposição desnecessária de dados:** prompts, logs e auditoria devem minimizar conteúdo clínico.
7. **Uma demo honesta:** recursos simulados claramente identificados; nunca afirmar que prescrição está assinada ou enviada sem integração real.

## 5. Perfis e papéis

- **Médico** (inclui medicina esportiva; outras especialidades médicas podem ser cadastradas): consultas, evoluções, relatórios, prescrições/solicitações conforme habilitação e implementação.
- **Fisioterapeuta:** avaliações funcionais, sessões, evolução de recuperação e relatórios fisioterapêuticos.
- **Nutricionista:** avaliações e evoluções nutricionais, planos alimentares, documentos próprios.
- **Psicólogo:** documentação psicológica com área restrita e compartilhamento limitado ao necessário e autorizado.
- **Preparador físico / educação física:** testes físicos, carga, relatórios de treinamento; possível integração posterior.
- **Enfermagem:** registros assistenciais e documentos compatíveis com suas atribuições.
- **Especialistas convidados:** cardiologia, ortopedia, neurologia, pediatria/medicina do adolescente, ginecologia, endocrinologia, fisiatria, psiquiatria, radiologia, odontologia; habilitação sob demanda, sem construir módulos completos agora.
- **Administrador operacional:** usuários, vínculos, categorias, convocações e auditoria autorizada; sem leitura automática de conteúdo clínico.

Cada usuário profissional terá perfil com identidade, profissão, conselho/registro quando aplicável, especialidade, status, vínculos e permissões efetivas. Perfis e vínculos não equivalem a acesso irrestrito a todos os atletas.

## 6. Jornada principal — demonstração de 17/11

**Pré-condições:** ambiente staging com contas de teste separadas, 8–12 atletas fictícios, convocações e registros sintéticos; profissional médico autenticado.

1. Login e landing Chat-first com logo/cores da CBB, cards `Buscar atleta`, `Nova evolução`, `Prontuários`, `Auditoria` (se autorizado).
2. Profissional pergunta por uma categoria/atleta; ferramenta faz busca autorizada e retorna resultados estruturados e clicáveis.
3. Profissional pede `Abra o prontuário de ...`; a interface faz a transição para UI clássica com atleta correto.
4. Chat permanece disponível, preservando mensagens, atleta em foco e identificador da conversa.
5. Profissional dita/digita uma evolução; IA **prepara rascunho** a partir do texto fornecido, sem inventar achados ou tratamentos.
6. Tela de revisão apresenta campos, autoria, data/hora, atleta e origem `ai_chat`/`ai_voice`; médico edita se necessário.
7. Médico confirma; o backend verifica permissões, persiste evolução e cria evento de auditoria correlacionado.
8. Histórico é atualizado. Tela de auditoria demonstra visualização, rascunho, confirmação e autoria, inclusive canal.
9. Alternar para outro perfil (por exemplo, fisioterapeuta) demonstra personalização e restrições de acesso; negar acesso a registro restrito deve falhar também na API.

**Foco em uma vertical completa, e não em dezenas de menus não funcionais.**

## 7. Requisitos funcionais prioritários

| ID | Requisito | Corte 17/11 |
|---|---|---|
| FR-01 | Login individual e sessão segura | Obrigatório |
| FR-02 | Perfil profissional com profissão, registro, vínculo e autorização | Obrigatório (mínimo) |
| FR-03 | Cadastro único de atletas e associação a categorias/convocações | Obrigatório |
| FR-04 | Busca e ficha/histórico do atleta | Obrigatório |
| FR-05 | Evolução clínica em rascunho, revisão e confirmação | Obrigatório |
| FR-06 | Chat-first com LLM real e operações de domínio autorizadas | Obrigatório |
| FR-07 | Navegação chat ↔ modo tradicional com contexto preservado | Obrigatório |
| FR-08 | Auditoria consultável com canal, responsável, recurso, ação e resultado | Obrigatório |
| FR-09 | Isolamento de registros psicológicos, incluindo busca e IA | Obrigatório (teste negativo mínimo) |
| FR-10 | Entrada por voz e transcrição | MVP Plus; alvo de 17/11 se estável, até 22/11 para demo |
| FR-11 | Armazenamento privado de exames/anexos | MVP Plus; após vertical crítica se necessário |
| FR-12 | Exportar relatórios em documento legível | MVP Plus; após vertical crítica |
| FR-13 | Prescrições, pedidos de exames/cirurgias, atestados e relatórios médicos | Modelos/rascunhos após validação; assinatura real fora de 17/11 |
| FR-14 | Integração Bird ID/Soluti e SNCR/Anvisa quando pertinente | Posterior; em aberto |
| FR-15 | Formulários profundos de demais especialidades | Posterior; validar com usuários |

## 8. IA: comportamentos e limites

### Operações autorizadas do agente (primeira entrega)

- `searchAthletes`: pesquisa contextual autorizada.
- `getAthleteSummary`: ficha básica e vínculos autorizados.
- `getClinicalTimeline`: histórico filtrado por permissão e sensibilidade.
- `prepareClinicalEntryDraft`: estrutura conteúdo fornecido pelo profissional como rascunho.
- `navigateTo`: retorna comando **estruturado** de navegação (não executa mutação clínica).

**Persistência** da evolução não é efeito colateral livre do agente. O salvamento requer confirmação humana por endpoint de aplicação; validar autorização novamente no servidor no momento da gravação.

O agente não pode: inventar fatos clínicos, diagnosticar autonomamente, recomendar condutas como decisão final, expor dados fora do escopo, assinar documentos, publicar registros sem aprovação ou acessar diretamente tabelas com credenciais elevadas.

## 9. Auditoria — obrigação de produto

Para cada evento auditável: usuário humano, ação, tipo/id do recurso, atleta relacionado quando aplicável, horário UTC, origem (`traditional_ui`, `ai_chat`, `ai_voice`, `system`), executor (`human`, `agent_tool`, `system`), resultado (`success`, `denied`, `failed`), request/correlation ID, conversation ID quando houver, aprovação humana quando aplicável e resumo permitido das alterações.

**Não armazenar texto completo de conversa, antes/depois clínico ou dados sensíveis desnecessários em logs de auditoria.** Para correções de prontuário, manter versões do registro clínico por mecanismo próprio com acesso restrito.

### Exemplo de trilha visível

- 09:40 — médico X — `athlete.view` — UI tradicional — sucesso.
- 09:43 — médico X — `clinical_entry.draft_prepared` — IA/chat — sucesso.
- 09:45 — médico X — `clinical_entry.confirmed` — originada via IA/chat, confirmada na UI — sucesso.
- 09:46 — usuário sem permissão — `psychology_entry.read` — negado (não expor o conteúdo).

## 10. Critérios de aceite da versão interna de 17/11

- [ ] Login individual médico e fisioterapeuta (ou segundo perfil real) e logout funcionam.
- [ ] Os atletas e históricos são persistidos em ambiente de teste; nenhuma dependência de arrays mockados na jornada principal.
- [ ] Busca pelo chat usa dados autorizados do backend e informa quando há ambiguidade.
- [ ] Comando de abrir prontuário muda interface sem perder a conversa.
- [ ] Evolução gerada pela IA é **rascunho**, editável, revisável e só salva após confirmação.
- [ ] O mesmo histórico aparece nas duas interfaces após salvar.
- [ ] A auditoria demonstra visualização, preparação, confirmação, origem e ator humano.
- [ ] Testes automatizados verificam usuário autorizado, acesso negado e ausência de bypass por IA/API.
- [ ] Branding CBB aplicado; layout responsivo para desktop e celular.
- [ ] Demo usa exclusivamente dados sintéticos e informa o que ainda não está implementado.
- [ ] Ambiente staging e um roteiro de 5–7 minutos estão disponíveis.

**Voz**: deve estar no MVP Plus, mas sua ausência na versão interna de terça pode ser tratada como pendência visível para resolução até a apresentação, desde que a jornada textual funcione completamente.

## 11. Fora do escopo da primeira versão

- Agenda, faturamento, gestão financeira e controle de consultas marcadas.
- Whitelabel/multitenancy comercial.
- Operação clínica de produção, importação de pacientes reais ou contas reais de profissionais da CBB.
- Assinatura digital efetiva, SNCR, prescrição de controlados ou alegação de conformidade regulatória pronta.
- Integração profunda com preparador físico e sistemas de terceiros.
- Agentes autônomos com decisões clínicas ou alterações sem confirmação.
- Análise preditiva de lesões.

## 12. Perguntas a validar com Carlos (sem bloquear a codificação)

1. Quais profissões atuarão nas primeiras convocações? Quantos usuários por profissão?
2. Como são definidas e encerradas permissões por convocação, sobretudo quando um profissional viaja temporariamente?
3. Que informações psicológicas podem ser compartilhadas com os demais profissionais? Quem define isso?
4. Qual o formato real da avaliação impressa por atleta/período?
5. Quais documentos médicos são usados mais frequentemente em uma seleção (e suas versões oficiais)?
6. Quais são os fluxos e dados da preparação física já existentes?
7. Quem decide sobre vínculo dos responsáveis legais, consentimentos e compartilhamento para menores?
8. Que provedores e métodos de assinatura são aceitos?

## 13. Indicadores iniciais de validação

- Conclusão da jornada principal sem ajuda do desenvolvedor.
- Tempo para localizar atleta e registrar uma evolução revisada.
- Percepção dos profissionais sobre velocidade, clareza e confiança.
- Zero transições que perdem contexto.
- Zero acessos indevidos em testes negativos conhecidos.
- Auditoria correspondente a 100% das mutações clínicas da demo.

---

**Observação:** este PRD define a experiência e o corte de entrega; não constitui validação médica, jurídica ou regulatória da plataforma.
