# Especificação recebida — Handoff 007.6

Fonte: chat “Analisar reunião de prontuário”. O adendo abaixo prevalece sobre a restrição de upload no chat do texto anterior.

# HANDOFF 007.6 — Implementação de Anexos Clínicos no Perfil do Atleta

**Projeto:** Prontuário CBB
**Prioridade:** P0
**Estado:** Funcionalidade anteriormente especificada, mas ainda não homologada
**Objetivo:** Permitir anexar, organizar, visualizar e consultar documentos clínicos no prontuário longitudinal do atleta.

## 1. Preparação

Antes de desenvolver, inspecione o repositório para verificar se existe implementação parcial do Handoff 007.6.

Não assumir que a funcionalidade está ausente nem que está concluída.

Identificar:
- Estrutura atual do perfil do atleta.
- Modelo de documentos clínicos.
- RPCs de autorização.
- Políticas de acesso por especialidade.
- Supabase Storage já utilizado para fotografias.
- Componentes de visualização de documentos.
- Infraestrutura existente de auditoria.

Reutilizar tudo que for adequado.

Não refatorar partes estabilizadas do prontuário.

## 2. Área de Documentos e Anexos

Implementar no perfil do atleta uma seção acessível chamada "Documentos e Anexos".

A seção deverá permitir:

- Adicionar documento.
- Listar arquivos existentes.
- Filtrar por categoria.
- Ordenar por data.
- Visualizar arquivo.
- Fazer download autorizado.
- Consultar metadados.
- Vincular arquivo a registros clínicos existentes.
- Editar metadados quando autorizado.

Manter o Clinical Design North Star já aprovado.

## 3. Upload de documentos

Suportar inicialmente:

- PDF.
- JPG/JPEG.
- PNG.
- WebP.

Sugerir limite inicial configurável de 20 MB por arquivo, respeitando os limites reais da infraestrutura.

O fluxo deverá permitir:

1. Selecionar arquivo.
2. Pré-visualizar identificação do arquivo.
3. Informar título.
4. Selecionar categoria.
5. Informar data do documento, quando disponível.
6. Informar descrição opcional.
7. Relacionar opcionalmente a uma evolução ou documento.
8. Confirmar upload.
9. Acompanhar progresso.
10. Visualizar o documento após conclusão.

Permitir múltiplos arquivos por atleta.

Não exigir associação a uma evolução para anexar um documento.

## 4. Categorias

Utilizar inicialmente:

- Exame laboratorial.
- Laudo de imagem.
- Imagem clínica.
- Relatório médico.
- Documento complementar.
- Outros.

Não misturar essa classificação com os tipos de documentos estruturados do domínio.

Evitar catálogo complexo neste primeiro momento.

## 5. Persistência

Utilizar Supabase Storage com bucket privado para arquivos clínicos.

Persistir metadados no PostgreSQL:

- Identificador do anexo.
- Atleta.
- Profissional responsável pelo upload.
- Título.
- Descrição.
- Categoria.
- Data clínica.
- Data do upload.
- Nome original.
- MIME validado.
- Tamanho.
- Referência interna ao objeto.
- Estado do arquivo.
- Política de visibilidade.
- Associação opcional a registro clínico.

Não armazenar arquivos binários diretamente na tabela clínica.

Não utilizar URLs públicas permanentes.

Não expor caminhos internos como informações de interface.

## 6. Associação a registros clínicos

Permitir associação opcional a:

- Evolução.
- Prescrição médica.
- Pedido cirúrgico.
- Solicitação de exames.

Validar que o registro pertence ao atleta correto.

Validar também as permissões de acesso ao registro associado.

Não permitir que associar um arquivo a outro documento amplie automaticamente sua visibilidade.

A associação não comprova que um exame foi realizado ou que um documento foi emitido.

## 7. Segurança

Requisitos obrigatórios:

- Bucket privado.
- Autenticação.
- Autorização verificada no backend.
- Validação de acesso ao atleta.
- Validação de permissão sobre o anexo.
- Controle de autoria e visibilidade.
- Rejeição de arquivos não permitidos.
- Validação do conteúdo/tipo real do arquivo, não somente extensão.
- Proteção contra acesso por manipulação de IDs.
- Nenhuma chave administrativa exposta ao frontend.
- Nenhum conteúdo clínico em logs.

O acesso ao atleta não concede automaticamente acesso irrestrito a todos os seus anexos.

Na ausência de uma política segura de compartilhamento, usar visibilidade restrita ao autor.

Para leitura e download, preferir um endpoint autenticado que revalide autorização. Se URLs assinadas forem usadas, limitar sua duração e documentar o comportamento após revogação de acesso.

Não declarar verificação antimalware caso ela não esteja implementada.

## 8. Consistência do upload

Supabase Storage e PostgreSQL não compartilham uma transação distribuída única.

Implementar tratamento adequado para:

- Upload interrompido.
- Falha ao salvar metadados.
- Reenvio.
- Arquivos órfãos.
- Submissões duplicadas.
- Cancelamento.

Um anexo só poderá ser apresentado como disponível depois da confirmação efetiva da operação.

## 9. Visualização

### PDF

Permitir abrir o documento em um visualizador seguro dentro do sistema.

### Imagens

Permitir visualização ampliada, mantendo proporção e legibilidade.

### Download

Disponibilizar download mediante autorização atual.

Registrar a operação na auditoria.

Não enviar os arquivos para visualizadores externos sem autorização apropriada.

## 10. Auditoria

Registrar:

- Criação do anexo.
- Alteração dos metadados.
- Consulta.
- Visualização.
- Download.
- Associação a registro.
- Retirada de uso ou exclusão autorizada.
- Tentativas negadas de acesso.

Preservar ator, atleta, anexo, operação, origem, horário e resultado.

Não copiar o conteúdo clínico para logs de auditoria.

## 11. Integração com o CBB Intelligence

Nesta etapa, reutilizar o sistema de consulta de documentos existente para permitir:

- Listar anexos autorizados.
- Identificar tipo, título e data.
- Abrir visualização segura pelo chat.
- Resolver referências como "abra o último laudo".

Não implementar upload diretamente pelo chat agora.

Não enviar automaticamente arquivos ao modelo Gemini.

Não permitir que a IA declare ter lido ou interpretado PDFs e imagens sem que essa capacidade tenha sido efetivamente executada.

Preparar os contratos para uma futura integração multimodal.

## 12. Experiência visual

Seguir a identidade CBB.

A seção deverá ter:

- Cabeçalho discreto.
- Ação principal "Adicionar documento".
- Listagem compacta.
- Ícones coerentes.
- Filtros.
- Estados vazios.
- Indicador de progresso.
- Mensagens de erro claras.
- Pré-visualização.
- Boa experiência desktop e mobile.

Não reconstruir o perfil do atleta.

Integrar o módulo à composição visual existente.

## 13. Retenção

Não implementar exclusão física indiscriminada de documentos clínicos.

Preferir retirada lógica de uso, conforme permissões e política de retenção.

Não remover anexos associados a registros finalizados sem uma regra institucional validada.

## 14. Critérios de aceite

Validar:

1. Upload de PDF.
2. Upload de imagem.
3. Associação ao atleta correto.
4. Persistência dos metadados.
5. Visualização no perfil.
6. Download autorizado.
7. Associação a uma solicitação de exame.
8. Consulta do arquivo pelo chat.
9. Bloqueio de acesso não autorizado.
10. Respeito à visibilidade privada.
11. Rejeição de arquivo inválido.
12. Tratamento de arquivo grande.
13. Falha de upload sem registro inconsistente.
14. Reenvio sem duplicação indevida.
15. Auditoria correta.
16. Continuidade do fluxo de evoluções.
17. Continuidade dos documentos médicos.
18. Ausência de regressões no CBB Intelligence.

Utilizar exclusivamente dados fictícios.

## 15. Entrega

Apresentar:

- Componentes implementados.
- Migrações.
- Estrutura do Storage.
- Operações de autorização.
- Capturas reais do perfil com anexos.
- Capturas do visualizador.
- Integração com o chat.
- Testes executados.
- Limitações e riscos.
- Estado da branch e commits.

Não realizar merge sem homologação.

**Critério final:** um profissional autorizado consegue anexar um PDF ou imagem ao prontuário de um atleta, organizar o documento, visualizá-lo, baixá-lo e encontrá-lo pelo CBB Intelligence, respeitando as permissões e a auditoria.

---

# ADENDO OBRIGATÓRIO — HANDOFF 007.6
## Upload de anexos diretamente pelo CBB Intelligence

Este adendo altera o escopo anterior do Handoff 007.6.

O upload de documentos clínicos deverá estar disponível tanto no perfil tradicional do atleta quanto na tela conversacional do CBB Intelligence.

### 1. Entrada pelo chat

Adicionar um botão de anexo (ícone de clipe) ao compositor do CBB Intelligence.

Quando existir um atleta em contexto:

- Permitir selecionar arquivos.
- Apresentar claramente o atleta destinatário.
- Abrir um formulário compacto para os metadados.
- Permitir confirmar o upload.
- Exibir progresso e resultado.
- Apresentar o anexo salvo na conversa.
- Permitir abrir sua pré-visualização.

A operação não deverá exigir navegação para o perfil tradicional.

### 2. Sem atleta em contexto

Não associar arquivos automaticamente.

Se o usuário tentar anexar sem atleta selecionado:

- Solicitar a seleção de um atleta autorizado.
- Permitir continuar o upload após a seleção.
- Não assumir o último atleta de uma conversa anterior.
- Não manter um arquivo associado implicitamente a outro atleta.

### 3. Mudança de contexto

Se houver um upload pendente e o usuário tentar trocar o atleta em contexto:

- Alertar sobre o destino do arquivo.
- Não alterar silenciosamente o atleta destinatário.
- Exigir confirmação explícita antes de continuar.
- Evitar uploads duplicados ou associados ao atleta errado.

### 4. Reutilização da arquitetura

O chat e o perfil tradicional deverão utilizar:

- O mesmo serviço de upload.
- O mesmo bucket privado.
- As mesmas validações de arquivo.
- As mesmas regras de autorização.
- O mesmo modelo de metadados.
- A mesma política de visibilidade.
- A mesma auditoria.
- Os mesmos mecanismos de pré-visualização e download.

Não implementar dois sistemas independentes de anexos.

### 5. Persistência e experiência

Após um upload bem-sucedido:

- O arquivo deverá aparecer imediatamente na conversa.
- Também deverá aparecer no perfil do atleta.
- O chat deverá apresentar um card compacto com título, categoria e ação de visualização.
- O agente poderá consultar os metadados do arquivo usando suas ferramentas autorizadas.
- A operação deverá registrar origem `ai_chat` quando iniciada pela interface conversacional, distinguindo a ação humana do uso de ferramentas do agente.

O simples upload não deverá executar uma análise automática do conteúdo pelo LLM.

### 6. Segurança

A identificação do atleta não poderá depender apenas de informações enviadas pelo frontend.

O backend deverá validar novamente a identidade, o contexto de destino e as permissões antes de concluir a associação.

Se a autorização for revogada ou o contexto se tornar inválido, interromper a operação e informar o usuário.

Não enviar arquivos automaticamente ao Gemini.

### 7. Critérios adicionais de aceite

1. Upload pelo perfil tradicional.
2. Upload diretamente pelo chat com atleta em contexto.
3. Solicitação de seleção quando não houver contexto.
4. Confirmação do atleta destinatário.
5. Bloqueio de troca silenciosa de atleta durante upload.
6. Documento disponível nas duas interfaces.
7. Pré-visualização do documento no chat.
8. Mesmas permissões e auditoria nas duas interfaces.
9. Ausência de uploads duplicados.
10. Nenhuma análise automática de arquivos pelo agente.

**Critério final:** o profissional consegue anexar documentos ao prontuário sem abandonar o CBB Intelligence, desde que o atleta esteja corretamente identificado e autorizado.
