# Checklist básico — validar documentos e voz no CBB Intelligence

Use o perfil médico e um atleta fictício do banco. Substitua os trechos entre colchetes pelo que aparece na sua plataforma. Reserve aproximadamente 15–20 minutos; esse tempo é uma sugestão para a validação manual, não uma medição automatizada.

A implementação está na branch `feat/handoff-007-10-6b-3-intelligence-journey`, ainda sem merge na main. Confira se o ambiente aberto contém essa versão. Assinatura e entrega deste roteiro são **simuladas**.

## O que usar por voz

| Ação | Como validar |
|---|---|
| Identificar atleta e definir contexto | Voz ou texto; confirme o atleta exibido |
| Criar proposta | Voz ou texto; informe os dados explicitamente; compare a transcrição |
| Alterar/adicionar/remover itens e revisar | Voz ou texto, uma instrução clara por vez |
| Salvar somente rascunho | Voz, texto ou botão; continua sem assinatura |
| Escolher identidade e pedir assinatura/envio | Voz ou texto; isso prepara a operação |
| Reconhecer a versão e o resumo | Botão “Li a versão e o resumo” |
| Confirmar assinatura/envio | **Texto ou botão no chat**; confirmação por voz deve permanecer pendente |
| Consultar estado | Voz, texto ou botão de atualização |
| Abrir histórico detalhado | Botão “Histórico de assinatura e entrega” no cartão |
| Confirmar derivação, retentativa ou reenvio | Texto explícito no chat; justificativa quando solicitada |

## Roteiro principal — prescrição

- [ ] **1. Entrar e ligar a voz.** Acesse como médico, inicie uma conversa e ative o microfone. Deve aparecer o estado “Ouvindo”. Confira a transcrição; se necessário, use “Revisar antes de enviar”.
- [ ] **2. Confirmar o atleta.** Fale: “Coloque [nome completo do atleta fictício] em contexto”. Confira o nome. Se houver mais de um resultado, escolha o correto antes de continuar.
- [ ] **3. Criar uma proposta simples.** Fale: “Crie uma prescrição para o atleta em contexto com Medicamento DEMO”. Deve aparecer uma proposta desse atleta. Não deve inventar dose, via ou outros dados ausentes.
- [ ] **4. Alterar somente um campo.** Fale: “Altere a dose do primeiro medicamento para DOSE DEMO”. Depois: “Altere a posologia do primeiro medicamento para orientação fictícia para demonstração”. Confira o valor literal e a preservação dos outros campos. Posologia fica no campo de instruções.
- [ ] **5. Testar dois medicamentos.** Fale: “Adicione um medicamento chamado Segundo Medicamento DEMO”. Confira os nomes e posições. Depois: “Altere a dose do segundo medicamento para OUTRA DOSE DEMO”. Somente o segundo deve mudar. Para remover, diga: “Remova o segundo medicamento”. Faça inclusão/remoção e alteração em mensagens separadas.
- [ ] **6. Revisar sem sair do chat.** Fale: “Revise a prescrição”. Expanda “Visualizar documento completo”. Confira atleta, profissional, conteúdo, dados ausentes e indicação de rascunho.
- [ ] **7. Salvar sem assinar.** Fale ou digite: “Pode confirmar e salvar a prescrição”. Deve aparecer “Rascunho salvo”, sem assinatura ou entrega. Recarregue a página: o conteúdo salvo deve continuar igual.
- [ ] **8. Preparar assinatura e entrega.** Fale: “Assine e envie”. Escolha uma identidade pelo nome exato exibido: “Use a identidade [nome exibido]”. Se não houver conexão demonstrativa, siga a opção “Conectar assinatura demonstrativa”. Confira versão, identidade, efeito e destinatário mascarado. Ainda não deve assinar nem enviar.
- [ ] **9. Conferir a proteção da voz.** Leia o documento e clique em “Li a versão e o resumo”. Fale: “Confirmo esta versão, a assinatura e o envio para o destinatário apresentado”. O sistema deve manter a operação pendente e orientar a confirmação por texto. **Não marque como falha:** essa recusa é o comportamento previsto para alto impacto por voz.
- [ ] **10. Confirmar no próprio chat.** Use o botão “Enviar confirmação de assinatura simulada” ou digite a frase de confirmação apresentada. Aguarde o resultado. Deve mostrar assinatura simulada, versão finalizada/somente leitura e acompanhamento da entrega simulada. Se não houver destinatário elegível, a entrega deve ser bloqueada; não use outro telefone por suposição.
- [ ] **11. Conferir resultado e recuperação.** Fale: “Qual o status da assinatura?” e “O documento já foi enviado?”. Abra “Histórico de assinatura e entrega”. Recarregue: deve recuperar o estado, sem outra assinatura ou entrega por causa da recarga.
- [ ] **12. Corrigir um finalizado.** Peça uma alteração na prescrição finalizada: o original não pode mudar. Diga: “Quero criar um documento derivado”. Depois de conferir a explicação, **digite** “Confirmo criar um documento derivado”. Deve criar outro rascunho vinculado, preservando o original e exigindo nova revisão/assinatura.

## Checagem rápida dos outros dois documentos

Primeiro use os modelos por texto para conferir o fluxo; depois repita falando e compare a transcrição e os campos. Os rótulos e separadores abaixo evitam confundir informações de itens diferentes. Se o reconhecimento não produzir esses rótulos corretamente, registre **“Texto OK / Voz pendente”**; não considere a voz aprovada só porque corrigiu por texto.

### Solicitação de exames

Copie no chat:

> Crie uma solicitação de exames para o atleta em contexto; Exame: Exame DEMO A; Tipo: Laboratorial; Exame: Exame DEMO B; Tipo: Imagem; Justificativa: Justificativa fictícia DEMO

- [ ] Aparecem os dois exames, com os tipos e a justificativa informados.
- [ ] “Altere as observações do segundo exame para observação fictícia DEMO” modifica somente esse item.
- [ ] “Revise a solicitação de exames” mostra o documento completo no chat.
- [ ] “Pode confirmar e salvar a solicitação de exames” salva sem assinar. Para testar assinatura, repita os passos 8–11; pode usar “Assine sem envio”.

### Pedido cirúrgico

Copie no chat:

> Crie um pedido cirúrgico para o atleta em contexto; Procedimento: Procedimento DEMO; Justificativa: Justificativa fictícia DEMO

- [ ] Procedimento e justificativa aparecem exatamente como informados, sem dados clínicos inventados.
- [ ] “Altere a justificativa do pedido cirúrgico para justificativa revisada DEMO” preserva o procedimento.
- [ ] “Revise o pedido cirúrgico” permite conferir o documento completo no chat.
- [ ] “Pode confirmar e salvar o pedido cirúrgico” salva sem assinar. Para testar assinatura, repita os passos 8–11 com “Assine sem envio”.

## Quatro conferências de segurança

- [ ] **Atleta:** ao mudar o atleta, uma confirmação anterior não pode executar sobre o novo contexto.
- [ ] **Versão:** prepare uma assinatura, altere o documento e tente a confirmação anterior. Deve exigir nova revisão/resumo/confirmação.
- [ ] **Finalizado:** edição do original deve continuar bloqueada, inclusive após recarga.
- [ ] **Permissões:** no perfil de psicólogo/sem autoria médica, não deve ser possível criar/assinar documentos médicos nem acessar registros restritos de outro profissional. A ausência de autoria médica não implica bloquear todas as funções clínicas desse perfil.

## Extras — só quando houver estado elegível

- Falha recuperável na entrega: peça “A entrega falhou? Tente novamente”. Confira o destinatário e siga a frase textual com justificativa que o chat apresentar. Não deve criar outra assinatura.
- Reenvio de entrega concluída: peça “Quero reenviar o documento” e siga a confirmação textual/justificativa. Deve usar a entrega existente como origem, sem outra assinatura.
- Tentativa de assinatura cancelada/encerrada com falha: prepare outra revisão e confirme novamente. Não deve reiniciar sozinha nem reutilizar a autorização anterior.
- Mobile: repita revisão, resumo e consulta de resultado; não deve haver rolagem horizontal nem necessidade de sair do chat.

Não é necessário provocar falhas ou modificar o banco para este checklist básico. Se o estado não ocorrer, marque o extra como “Não testado”; os testes automatizados cobrem esses cenários com fixtures controladas.

## Como anotar o resultado

Use uma linha por etapa:

| Etapa | Texto | Voz | Observação |
|---|---|---|---|
| Ex.: alterar o segundo medicamento | OK / Falhou / Não testado | OK / Falhou / Não testado | Frase falada, transcrição recebida, resultado e captura se houver diferença |

Na validação por voz, avalie separadamente **o que você falou → o que foi transcrito → o que a plataforma executou**. A qualidade acústica/ASR e o comportamento de um modelo externo real precisam dessa validação manual; os 351 testes automatizados aprovados usaram provedores/transcrições controlados. Confirmação de assinatura/envio por texto é uma limitação documentada, não uma funcionalidade de voz já homologada.
