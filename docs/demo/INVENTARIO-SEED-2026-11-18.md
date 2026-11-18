# Dados disponíveis para apresentação do protótipo

Inventário do **Supabase local**, consultado em 18/11/2026. Dados da instância `prontuario-cbb` (API 54321), não da instância descartável da auditoria. Consulta administrativa, sem corpos clínicos ou senhas. Nenhum seed/reset foi executado nesta consolidação.

[Dados estruturados](seed-local-2026-11-18.json) · [Lista dos 176 atletas marcados como DEMO, com contagens por tipo](atletas-demo-2026-11-18.csv).

## O que existe hoje

| Conteúdo | Quantidade |
|---|---:|
| Atletas no banco | **178** |
| Elenco principal `qa004:cbb-qa-1` | **174** |
| Atletas básicos Aurora e Horizonte | **2** |
| Cadastros manuais fora do seed | **2** |
| Evoluções | **340** |
| Prescrições | **265** |
| Solicitações de exames | **273** |
| Pedidos cirúrgicos | **206** |
| Documentos médicos, somando os três tipos | **744** |
| Anexos clínicos cadastrados | **0** |
| Vínculos esportivos, incluindo histórico | **199** |
| Vínculos vigentes na data da consulta | **175** |
| Perfis profissionais | **7** |
| Conversas persistidas | **20** |

As contagens são do banco inteiro. **O que aparece na aplicação depende do profissional autenticado.** Evoluções restritas e documentos de outro autor não são revelados apenas por existir acesso ao atleta. A planilha é um inventário administrativo da massa fictícia, não uma mudança de visibilidade na interface.

Os dois cadastros manuais encontrados são `Atleta QA Minimo e61b7e0b` e `Nome do Atleta`; ficaram preservados. Entre os sete perfis, cinco são contas de demonstração e dois são contas residuais de teste. Não foram removidos ou redefinidas senhas.

## Elenco esportivo

O gerador atual substituiu a antiga massa de cinco mil nomes por um elenco menor e mais legível. Os relatórios históricos de carga de 5 mil continuam válidos como testes de desempenho, mas **não descrevem a quantidade atualmente carregada na demo**.

| Categoria | Feminino | Masculino | Total |
|---|---:|---:|---:|
| Sub-15 | 15 | 15 | 30 |
| Sub-17 | 14 | 14 | 28 |
| Sub-19 | 15 | 15 | 30 |
| Sub-21 | 14 | 14 | 28 |
| Sub-23 | 15 | 15 | 30 |
| Adulto | 14 | 14 | 28 |
| **Total do elenco** | **87** | **87** | **174** |

No elenco principal, 168 atletas estão ativos e seis inativos. Cada atleta tem um vínculo vigente; 24 também têm vínculo encerrado de 2025. Não há atleta desse elenco com dois vínculos simultaneamente vigentes no snapshot. Os nomes de clubes são de referência; as pessoas e seus vínculos nesta massa são fictícios.

Os 174 atletas têm nascimento informado; nenhum tem nome social preenchido no seed principal. Há 44 imagens abstratas sintéticas usadas como foto/placeholder, não retratos de pessoas reais. Quarenta e dois atletas do elenco não têm evolução nem documento médico, além do caso básico Horizonte, que permanece vazio.

## Casos recomendados para mostrar

As quantidades abaixo são administrativas, antes das regras de visibilidade por usuário.

| Atleta | Evoluções | Prescrições | Exames solicitados | Pedidos cirúrgicos | Melhor demonstração |
|---|---:|---:|---:|---:|---|
| **Marina Costa** | 4 | 0 | 0 | 0 | Linha do tempo multidisciplinar e histórico esportivo |
| **Bruna Junqueira Xavier** | 4 | 5 | 4 | 5 | Perfil com os três tipos de documento e rascunhos |
| **Paloma Uchoa Oliveira** | 5 | 4 | 3 | 5 | Histórico mais extenso e vínculo esportivo anterior |
| **Alice Almeida Lopes** | 3 | 3 | 0 | 0 | Diferenças de autorização entre profissionais |
| **Atleta DEMO Aurora** | 2 | 0 | 0 | 0 | Exemplo básico de leitura longitudinal |
| **Atleta DEMO Horizonte** | 0 | 0 | 0 | 0 | Cadastro mínimo e estados vazios |

### Roteiro curto, sem preparar dados novos

1. Entrar com **`medico.demo@example.com`** e mostrar a Home limpa, busca de atleta e filtros sempre visíveis.
2. Buscar **Bruna Junqueira Xavier**: Sub-17, Feminino, 5x5, ADRM Maringá. Abrir perfil, timeline e documentos; há material para mostrar prescrição, exames e pedido cirúrgico. Os 14 documentos desse caso são do médico da demo.
3. Buscar **Marina Costa**: Sub-19, Feminino, 3x3, Sesi Araraquara. Mostrar as quatro evoluções finalizadas e compartilhadas: ortopedia, cardiologia, fisioterapia e psicologia. O vínculo anterior com Corinthians terminou em 31/12/2025. Ela não tem documentos médicos pré-carregados; não usar esse caso para procurar receitas já salvas.
4. Opcionalmente abrir **Paloma Uchoa Oliveira** para uma timeline mais extensa; vínculo atual no Basquete Blumenau e anterior no Sampaio Basquete.
5. Abrir **Horizonte** para estados vazios e **Aurora** para a leitura básica de dois registros.
6. Para autorização, comparar **Alice Almeida Lopes** nos logins de medicina e ortopedia: há um rascunho privado de cada autor e uma evolução finalizada compartilhada de fisioterapia. Cada profissional deve ver sua própria proposta/rascunho autorizado, não o privado do outro. Seus três documentos são do médico.

Para mostrar anexos será necessário anexar um arquivo fictício durante a demonstração: **não há anexos pré-carregados**. O arquivo sintético do design lab pode ser usado como exemplo; nenhum upload foi feito por esta consolidação. Para usar o CBB Intelligence, a disponibilidade do provedor/chave continua dependendo da configuração local; nenhum segredo integra este inventário.

## Contas disponíveis

| Login fictício | Perfil | Atletas vinculados | Auditoria | Autoria médica habilitada |
|---|---|---:|---|---|
| `medico.demo@example.com` | Profissional DEMO · medico.demo — Medicina esportiva | 176 | Sim | Sim |
| `ortopedia.demo@example.com` | Dra. Helena Prado — Ortopedista | 175 | Não | Sim |
| `cardiologia.demo@example.com` | Dr. Caio Mendonça — Cardiologista | 174 | Não | Sim |
| `fisioterapia.demo@example.com` | Dra. Renata Guimarães — Fisioterapeuta | 174 | Não | Não |
| `psicologia.demo@example.com` | Dra. Lúcia Andrade — Psicóloga | 174 | Não | Não |

Os quatro especialistas têm acesso ao elenco de 174 atletas. Edição cadastral está habilitada para ortopedia e médico nos respectivos vínculos autorizados; fisioterapia, cardiologia e psicologia não têm essa edição nos vínculos inspecionados. Permissões de escrita/finalização de evolução não significam permissão de autoria de documento médico.

A autoria médica habilitada em cardiologia/ortopedia não dá acesso aos documentos privados do médico. Dos 744 documentos, **736 são do médico da demo e oito da ortopedista**. Para apresentar os documentos já preenchidos em maior quantidade, usar o login médico.

As senhas existentes não foram lidas, divulgadas ou alteradas. O gerador de contas novas usa senhas aleatórias e as exibe somente na criação; este documento não recupera senhas já existentes.

## Estado clínico da massa

Há 98 evoluções em rascunho e 242 finalizadas. As regras de privacidade continuam valendo: existem rascunhos/versões restritos ao autor, além dos registros compartilhados com a equipe.

| Documento | Rascunho | Pronto para revisão | Total |
|---|---:|---:|---:|
| Prescrição | 208 | 57 | 265 |
| Solicitação de exames | 216 | 57 | 273 |
| Pedido cirúrgico | 161 | 45 | 206 |
| **Total** | **585** | **159** | **744** |

Esses estados **não significam assinatura, emissão, realização de exame ou cirurgia realizada**. O seed contém solicitações e textos de demonstração. Os registros `DEMO fluxo` do preenchimento clínico distribuem ocorrências entre 2026 e as datas fixas do gerador, não criam resultados reais ou condutas médicas reais.

## De onde os dados vieram

| Arquivo | Papel | Cuidados ao repetir |
|---|---|---|
| [qa-athletes.mjs](../../scripts/qa-athletes.mjs) | Gera 174 atletas determinísticos por lote, seis categorias, dois naipes, vínculos atuais/históricos e quatro especialistas; adiciona quatro registros multidisciplinares de Marina | O comando roster **remove e recria o lote**. Reset também remove a massa. Pode afetar registros e dependências; não executar apenas para “atualizar a tela”. |
| [seed-athletes.sql](../../scripts/seed-athletes.sql) | Cria Aurora, Horizonte, acesso para uma conta escolhida e dois registros básicos | Usa IDs fixos/on conflict; não substitui o elenco nem provisiona toda a configuração clínica. |
| [seed-demo-chart.mjs](../../scripts/seed-demo-chart.mjs) | Distribui evoluções, prescrições, exames solicitados e pedidos cirúrgicos nos atletas `source=demo`, com UUIDs e sorteio determinísticos | Remove os registros marcados `DEMO fluxo` e os gera novamente. Não preserva edições feitas nesses itens. Horizonte fica sem conteúdo novo. |
| [create-demo-user.mjs](../../scripts/create-demo-user.mjs) | Cria conta fictícia individual com senha recebida pela entrada padrão | Não executado nesta tarefa; não é um leitor ou recuperador de senhas. |

Os geradores não rodam automaticamente em build/start. O estado do banco é separado do Git: a tag do protótipo fixa código, testes e documentação; **não é um backup do banco**. Este inventário registra o que foi encontrado, sem reset, reexecução de seed, alteração de permissões ou preenchimento de lacunas.

## Registro de migrações local

Há 28 arquivos de migração e 27 versões registradas no ledger local. A versão `20261115000900_access_and_secrecy` não consta como aplicada, mas as colunas de controle de acesso e as funções de concessão/revogação já existem. Os testes de acesso passam com os objetos atuais. Isso é uma divergência pré-existente de rastreamento, não uma autorização para reaplicar o DDL: ele adiciona colunas/funções já presentes e pode falhar por duplicidade.

Nenhuma migração foi aplicada ou marcada artificialmente nesta tarefa. Uma manutenção futura do ledger deve reconciliar o histórico com verificação completa dos objetos; esta pendência não altera as contagens do inventário. Verificação resumida no snapshot JSON.

## O que permanece fora da versão

Encerrar/arquivar/restaurar/excluir conversas por menu ainda **não foi implementado**: o 007.10.4A foi auditoria. Não apresentar o botão de excluir como disponível. Os bloqueios de ciclo de vida/pendências e autorização histórica estão documentados no [relatório 007.10.4A](../audits/HANDOFF-007-10-4A-gestao-conversas.md) e dependem do 007.10.4B.

A versão consolidada é uma baseline validada para apresentar os fluxos já implementados. Não representa homologação de produção ou correção automática dos achados da auditoria de conversas.
