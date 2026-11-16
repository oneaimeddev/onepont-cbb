# Clinical Design North Star

Aprovado em 15/11/2026 como direção visual das interfaces tradicionais.
A implementação de referência permanece em `/design-lab/clinical-north-star`.
A captura aprovada está em `docs/visual/design-sprint-002-1/perfil-longitudinal-1440x900.png`.

Esta aprovação é visual. A rota de referência não lê o banco, não autentica e não substitui `/atletas/[id]`.
As telas convencionais passam a reutilizar esta composição. A Home CBB Intelligence permanece a entrada aprovada.

## Padrões reutilizáveis

Canvas `#f4f6fa`, superfície branca, fio `#e4e9f1`, tinta `#0a1731`, texto de apoio `#3a4660`, texto corrido `#1a1a1a`.
Azul `#0079d5` fica no foco e no link textual. Verde `#007132` fica na ação principal da tela, com hover `#005c28`.
Rascunho usa `#6b5400`. Seleção de texto `#d6e8f8`.

Geist Serif Regular, peso 400, só no nome do atleta, a 32 px, entrelinha 1.08 e tracking −0.03em.
Geist Sans em navegação, fatos, histórico, formulários e controles.
Títulos de seção em sans, 17 px, peso 600.

Faixa de 80 px, branca, com o escudo oficial a 34 px e ícones de 42 px, no mesmo desenho da Home.
Cabeçalho com o produto e o profissional: nome a 14 px e especialidade a 12 px.

Masthead do atleta: retrato 108×144, raio 14 px; uma frase de contexto esportivo; quatro fatos alinhados à esquerda; duas ações à direita.
A ação principal é o botão verde, altura 44 px, raio 12 px. A secundária é branca, com fio `#e4e9f1`.

O histórico é uma coluna de trabalho, não uma grade de cards.
O registro aberto é texto sobre o canvas. Os demais são linhas.
Dia, título, autor e estado ocupam colunas estáveis. A linha do tempo é um fio `#c5d0de` com marca de 7 px.
Meses entram como headings de 13 px.

A coluna lateral separa-se por um fio, sem card. A ordem é pendência, temporada e equipe.
Nomes e especialidades bastam. O estado comum não se repete como etiqueta.

Filtro selecionado: fundo branco, fio e raio pleno. Foco visível: contorno de 2 px em `#0079d5`.
Abaixo de 1200 px a coluna lateral desce. Abaixo de 760 px a faixa vira uma barra e as ações empilham.

## O que a referência não autoriza

O protótipo mostra um registro de psicologia para ilustrar o estado “restrito à autora”.
Na aplicação real, um profissional sem autorização não recebe o registro nem o metadado: título, autor, data, especialidade ou existência.
A integração usa somente o que a consulta já devolve ao profissional autenticado.

Também ficam de fora da integração o retrato gerado, os atletas fictícios da página e o rascunho que não sai do navegador.
`public/design-lab/lara-benedetti.jpg` não representa pessoa real e não entra nos 5.002 cadastros.

## Plano de integração

Cada etapa reaproveita a composição aprovada numa tela que já existe.
Não há RPC, tabela, permissão, auditoria nem regra clínica nova.
Os fluxos atuais permanecem: busca, filtros, paginação, abas do atleta, evolução, finalização e auditoria.
Os testes existentes precisam continuar passando. Cada etapa termina com captura real da tela alterada.

1. Moldura das rotas convencionais. A faixa e o cabeçalho passam a repetir a Home e a referência: 80 px, escudo, ícones e identificação do profissional. A Home em `/` não muda.
2. Perfil do atleta em `/atletas/[id]`. Masthead, histórico e coluna de contexto usam os dados que a página já carrega. As abas Visão geral, Linha do tempo e Dados cadastrais continuam, porque os testes e os links atuais dependem delas. O botão de atendimento conserva o nome acessível “Iniciar atendimento”.
3. Evolução em `/atletas/[id]/evolucao`. O mesmo masthead compacto e a superfície de escrita da referência. O envio, a restrição ao autor e a finalização continuam nos contratos atuais.
4. Diretório em `/atletas`, `/prontuarios` e `/evolucoes`. As linhas seguem a leitura do histórico: foto, nome e fatos esportivos, com busca, filtros e páginas de 25 registros.
5. Auditoria. A lista adota a mesma linha e os mesmos estados, sem ampliar o conjunto de eventos.
6. Cadastro e login por último. O login só deixa o painel azul quando a operação já estiver coerente.

Nenhuma etapa introduz outra linguagem visual.
As seis etapas estão aplicadas nas rotas convencionais, sem RPC, permissão ou regra clínica nova.
