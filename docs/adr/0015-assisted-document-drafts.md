# 0015. Rascunhos de documentos no CBB Intelligence

Prescrições e pedidos cirúrgicos preparados na conversa usam o mesmo `clinical.documents` da interface tradicional. A proposta fica em `clinical.document_proposals` só até a confirmação. Quem grava é `document_save`, sempre com a intenção `save`, então o estado permanece `draft`. A conversa não emite, não assina e não marca o documento para revisão.

A frase explícita segue a mesma regra da evolução: o banco lê a mensagem autenticada, exige uma única proposta quando a frase não nomeia o tipo, compara o conteúdo com o snapshot e grava o texto armazenado. Nomear a prescrição ou o pedido escolhe esse tipo. Emitir, assinar, finalizar ou uma pergunta não grava. O botão do cartão continua disponível e, se o médico editou a proposta, grava essa versão. As ferramentas do modelo não recebem uma operação que persista o documento.

Só o profissional com a habilitação médica já existente vê essas ferramentas. A lista e a abertura continuam restritas aos documentos do próprio autor. O histórico da conversa guarda o título e o identificador do rascunho salvo, sem dose, posologia, indicação ou justificativa.
