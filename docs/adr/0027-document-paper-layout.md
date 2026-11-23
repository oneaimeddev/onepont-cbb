# 0027. Papel timbrado e padrão por tipo de documento

Pedido do responsável pelo produto em 23/11/2026.

Todos os documentos médicos passam a ser exibidos no mesmo papel timbrado (`document-paper.tsx`): cabeçalho com o escudo e "Confederação Brasileira de Basketball · Departamento Médico · Seleções Brasileiras", título centralizado do documento, linha do paciente, corpo próprio do tipo e, ao final, data por extenso e assinatura (linha, nome e identificação profissional). No cartão do chat, o papel aparece compacto, sem cabeçalho e assinatura.

Corpo de cada tipo, no padrão usual brasileiro:

- **Receituário (prescrição):** inalterado (ADR anterior): agrupado por via ("USO ORAL"), itens numerados com quantidade à direita e posologia em texto corrido.
- **Solicitação de exames:** "Solicito:" e exames numerados em sequência, agrupados em exames laboratoriais, de imagem e outros; região e lado na mesma linha ("Ressonância magnética — tornozelo, lado direito"), detalhes técnicos e observações abaixo. Depois: indicação clínica, hipótese diagnóstica, justificativa, orientações ao paciente e caráter (eletivo, prioritário ou urgente) destacado.
- **Solicitação de procedimento cirúrgico:** procedimento proposto em destaque com região e lado; diagnóstico/hipótese, indicação clínica, justificativa, materiais especiais (OPME), informações complementares e caráter.
- **Atestado e encaminhamento:** carta já existente (CFM 1.658/2002 e 1.851/2008 para atestados), agora com o título no papel e a assinatura ao final.

Os textos são montados só com os valores informados (`request-format.ts`, `letter-format.ts`, `prescription-format.ts`); campos vazios são omitidos. O PDF de entrega continua disponível apenas para a prescrição.
