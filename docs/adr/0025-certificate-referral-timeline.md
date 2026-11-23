# 0025. Atestados, encaminhamentos e documentos na linha do tempo

Pedido do responsável pelo produto em 23/11/2026.

## Tipos de documento

Os documentos médicos passam a ser cinco, nesta ordem no menu "Novo documento": Prescrição e Solicitação de exames; depois, no grupo "Documentos", Atestado, Encaminhamento e Pedido cirúrgico.

- **Atestado (`certificate`)** segue as Resoluções CFM 1.658/2002 e 1.851/2008, com três modalidades:
  - afastamento: dias, início e atividades afastadas;
  - comparecimento: data, chegada e saída;
  - aptidão esportiva: apto, apto com restrições ou temporariamente inapto, com a atividade avaliada.

  O CID-10 só aparece no texto com a autorização expressa do paciente marcada. Sem ela, o documento não fica pronto para revisão. O texto segue a redação usual ("Atesto, para os devidos fins…"), com o número de dias também por extenso.
- **Encaminhamento (`referral`)** é uma carta ao serviço ou profissional de destino, com motivo, resumo clínico, hipótese diagnóstica com CID-10, exames, tratamentos realizados, o que se solicita e prioridade.

O texto dos dois é montado em `src/features/documents/letter-format.ts`, só com os valores informados. Campos vazios aparecem como lacunas a preencher.

## Banco

A migração `20261123000100_certificate_referral_documents.sql` amplia as restrições das tabelas de documentos, propostas e revisões. Ela envolve as funções de conteúdo canônico, pendências, prontidão, rótulo e detecção do tipo pela fala, e os tipos existentes continuam passando pelas funções anteriores, renomeadas para `*_c2`. A migração também regenera, a partir da definição atual, toda função que lista os tipos de documento, e amplia para sete tipos o limite da busca clínica. Ela foi validada num PostgreSQL local com as 62 migrações anteriores: salvar, revisar, listar, buscar, propor pelo chat e salvar pelo cartão, com os tipos novos e os antigos.

## Chat

O agente ganhou `prepareCertificate` e `prepareReferral`, disponíveis aos mesmos profissionais que já preparam documentos médicos. Cada valor proposto pelo modelo só é mantido se o profissional o disse na mensagem, conforme `operations/letter-documents.ts`:

- textos livres precisam aparecer na mensagem;
- dias e horários precisam ter sido ditos;
- a modalidade e a conclusão do atestado são conferidas por palavras da mensagem;
- a autorização do CID só é marcada se a mensagem disser que o paciente autorizou;
- sem outra data na mensagem, a data do atendimento é a de hoje.

O resto fica em branco e pendente no cartão, onde o profissional edita e confirma. Leitura, listagem, retomada, revisão, assinatura e entrega reconhecem os novos tipos. A edição campo a campo por fala continua restrita aos três tipos originais.

## Linha do tempo

A aba "Linha do tempo" do atleta mostra os documentos médicos junto com as evoluções, por data de criação, com tipo, estado, autor e o link "Ver documento". O filtro "Registros" separa evoluções e documentos. Os filtros de especialidade e de estado da evolução mostram só evoluções. A linha do tempo segue a mesma privacidade da aba de documentos: cada médico vê os documentos que pode abrir.
