# HANDOFF 007.10.6D — Correções de Sigilo, Timeline e Edição de Evoluções

**Projeto:** Prontuário CBB  
**Prioridade:** P1 — Bloqueante para homologação do fluxo clínico tradicional  
**Natureza:** Correção funcional, autorização e integridade clínica  
**Escopo:** Exclusivamente evoluções clínicas.

## Objetivo

Corrigir três comportamentos identificados na homologação:

1. Evoluções restritas desaparecem da timeline para profissionais sem acesso.
2. Evoluções de Psicologia não possuem sigilo obrigatório de conteúdo.
3. Não existe uma jornada adequada para editar ou corrigir evoluções registradas.

Preservar a interface atual. O refinamento de UX será realizado posteriormente.

## 1. Evoluções restritas na timeline

Toda evolução registrada deverá permanecer representada na timeline do atleta para profissionais autorizados a visualizar seu histórico geral, mesmo sem permissão para consultar o conteúdo daquela evolução.

Para profissionais sem acesso ao conteúdo:

- Mostrar a existência do atendimento.
- Mostrar data/hora e identificação mínima permitida do profissional.
- Exibir indicador "Conteúdo restrito".
- Não retornar corpo, diagnóstico, título sensível, observações ou anexos protegidos.
- Não permitir acesso indireto por busca, IA, preview, exportação ou API.

A restrição deve ser implementada no backend, separando permissão de visualizar metadados da permissão de ler o conteúdo.

Evitar que a timeline exponha informações protegidas por meio de contagens, resumos, erros ou campos auxiliares.

## 2. Sigilo obrigatório em Psicologia

Evoluções clínicas classificadas como Psicologia devem ter conteúdo restrito por regra de domínio.

- Aplicar a restrição automaticamente na criação.
- Não oferecer opção de tornar o conteúdo público para toda a equipe.
- Preservar o acesso do autor e de outros usuários especificamente autorizados pela política institucional.
- Impedir alteração de profissão/tipo ou manipulação de payload para contornar o sigilo.
- Aplicar a regra igualmente a registros originados pela interface tradicional ou pelo CBB Intelligence.
- Garantir que IA, buscas, anexos e exportações respeitem o sigilo.
- Registrar tentativas de acesso negadas na auditoria, sem expor conteúdo.

O prontuário multiprofissional poderá futuramente receber informações assistenciais compartilháveis elaboradas pelo psicólogo, em registro próprio e sujeito a autorização.

Não liberar automaticamente o conteúdo sigiloso original.

Avaliar os registros históricos de Psicologia para evitar exposição indevida, preservando evidências e sem reescrever silenciosamente conteúdos clínicos.

## 3. Edição e correção de evoluções

Implementar a ação "Editar evolução" para o autor ou profissional com autorização específica.

### Rascunhos

Permitir edição dos campos existentes, com validação e persistência segura.

### Evoluções publicadas

Permitir correção por meio de revisão versionada:

- Preservar conteúdo e autoria originais.
- Registrar autor da correção, data/hora e motivo da alteração.
- Manter histórico recuperável e auditável.
- Exibir o conteúdo vigente aos usuários autorizados.
- Não criar um novo atendimento na timeline para cada revisão.
- Não permitir sobrescrita silenciosa da versão anterior.
- Respeitar o sigilo original em todas as revisões.

Não transformar uma evolução publicada em rascunho para permitir alterações.

Não permitir editar versões efetivamente assinadas; utilizar registro de correção vinculado quando necessário.

## 4. Segurança

Inspecionar e preservar autorização em:

- RPCs e consultas clínicas.
- Timeline.
- Detalhe da evolução.
- Edição e publicação.
- Histórico de revisões.
- CBB Intelligence.
- Buscas e resumos.
- Anexos.
- Auditoria.

A aplicação não deve confiar em uma flag de visibilidade enviada pelo cliente como autoridade.

## 5. Testes direcionados

Priorizar:

1. Evolução comum visível.
2. Evolução restrita com metadados visíveis e conteúdo oculto.
3. Autor consultando evolução própria.
4. Outro profissional sem acesso tentando consultar o conteúdo.
5. Psicologia com sigilo obrigatório.
6. Tentativa de remover sigilo de Psicologia via API.
7. Edição de rascunho.
8. Correção de evolução publicada.
9. Preservação de versão anterior.
10. Controle de concorrência.
11. Histórico de auditoria.
12. Ausência de vazamento por IA ou busca.
13. Evolução restrita após correção.
14. Compatibilidade dos registros históricos.

Executar testes direcionados e regressão por impacto. Não repetir a suíte integral sem necessidade técnica.

## 6. Critérios de aceite

O handoff estará pronto quando:

- Uma evolução restrita continuar aparecendo na timeline, sem expor seu conteúdo.
- Evoluções de Psicologia forem obrigatoriamente sigilosas.
- O autor autorizado conseguir editar rascunhos e corrigir evoluções publicadas.
- Correções preservarem o histórico.
- O backend impedir acesso e alterações indevidas.
- A interface tradicional continuar funcional.
- Não houver regressões nos demais registros clínicos.

Não redesenhar a jornada de evolução neste handoff.

Apresentar relatório com arquivos alterados, migrações, testes direcionados, cenários de autorização, evidências visuais e pendências.

Não realizar merge, push ou deploy sem homologação.
