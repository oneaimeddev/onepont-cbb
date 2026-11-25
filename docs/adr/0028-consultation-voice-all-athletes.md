# ADR 0028 — Gravação de consulta liberada para todos os atletas

Data: 2026-11-25

## Contexto
A gravação de consulta ao vivo (Registrar evolução por voz) nasceu restrita a atletas
fictícios (`clinical.athletes.source = 'demo'`), com aviso de encenação e caixa de
confirmação. Depois da preparação da entrega oficial, a produção passou a ter só os atletas
da seleção cadastrados manualmente, e a função ficou indisponível para todos.

## Decisão
Por decisão do responsável, a trava de atleta fictício foi removida das funções
`consultation_*` e `chat_consultation_navigation` e das páginas, sem etapa extra de
consentimento na tela. Continuam valendo: especialidade do profissional, acesso de leitura e
escrita ao atleta, autoria da gravação, expiração do áudio em 7 dias e revisão humana antes de
finalizar a evolução. O código interno `staged_fictional_v1` permanece apenas como rótulo do
protocolo de captura.

## Consequências
O áudio de consultas reais é enviado ao provedor de transcrição. O consentimento do atleta
para a gravação fica sob responsabilidade do profissional e da CBB, fora da plataforma.
