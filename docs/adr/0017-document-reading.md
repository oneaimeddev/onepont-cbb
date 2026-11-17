# 0017. Leitura de documentos na conversa

Prescrições e pedidos cirúrgicos continuam em `clinical.documents`. A conversa não ganha um acervo paralelo. Quem consulta é o autor médico com acesso ao atleta. Outro profissional, mesmo com leitura do prontuário, não recebe título, contagem nem conteúdo. Administrador operacional também não.

O modelo escolhe a consulta e recebe só identificador, tipo, estado e data. Dose, justificativa, indicação e texto clínico ficam fora da resposta da ferramenta e fora das mensagens gravadas. O cartão busca o original de novo, com a sessão atual. Se o acesso foi revogado, o cartão some. O conteúdo antigo da conversa não serve para contornar a revogação.

A frase do profissional decide a referência: última, ordinal da lista desta conversa, documento recém-gravado ou o item anterior. Várias correspondências voltam como escolha. A leitura não troca o atleta em contexto. Evoluções usam a linha do tempo já existente e continuam só leitura.
