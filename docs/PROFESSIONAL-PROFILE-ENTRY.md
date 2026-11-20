# Acesso ao perfil profissional

20/11/2026. Implementação pontual solicitada após a auditoria 007.10.6A.

O menu aberto pelo nome/avatar no canto superior direito agora contém **Meu perfil**, com destino `/perfil`. O mesmo componente é usado na Home CBB Intelligence e nas telas internas. Auditoria aparece conforme a permissão existente; Sair permanece disponível no menu.

A página é de **consulta do profissional autenticado**: nome de exibição, profissão informada, e-mail de acesso, identificação médica cadastrada e permissões operacionais de auditoria, gestão de acessos e autoria médica. Nenhum identificador fornecido por query string seleciona outro perfil. A rota exige autenticação e usa as consultas/RPCs já existentes.

Assinatura digital aparece como **Indisponível nesta versão**. Não foram implementados edição cadastral, múltiplas inscrições, verificação de conselho, conexão com provedores ou assinatura. O rótulo de identificação é apresentado como cadastrado, sem confundi-lo com habilitação verificada. O escopo completo permanece na proposta do [007.10.6A](audits/HANDOFF-007-10-6A-perfil-profissional-assinatura-multiprovedor.md).

## Menu e navegação

O menu tem estados expandidos/recolhidos, foco inicial no primeiro item, setas/Home/End, Escape com retorno ao acionador e fechamento ao clicar/focar fora. É mantido no lado direito também em telas pequenas. Sair usa a mesma action de logout existente. O componente de botão ganhou somente a possibilidade de anunciar o papel menuitem nesses formulários.

O CSS do menu existente foi extraído para ser compartilhado. Não houve mudança de banco, RPC, autenticação, permissões clínicas ou integração de assinatura. Testes de logout foram ajustados para abrir o dropdown e selecionar o item por seu papel acessível.

## Evidências reais

Dados fictícios de teste, aplicação compilada e Chromium headless, sem abrir janelas visíveis.

| Tela | Desktop | Mobile |
|---|---|---|
| Menu da conta | [1440px](visual/professional-profile-entry/menu-1440.png) | [390px](visual/professional-profile-entry/menu-390.png) · [320px](visual/professional-profile-entry/menu-320.png) |
| Meu perfil | [1440px](visual/professional-profile-entry/perfil-1440.png) | [390px](visual/professional-profile-entry/perfil-390.png) · [320px](visual/professional-profile-entry/perfil-320.png) |

## Validação

- `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- Suíte completa: 75 cenários executados; 73 aprovados e dois seletores antigos do botão da conta falharam após a atualização do nome acessível. Os seletores foram atualizados e `npx playwright test --last-failed --workers=1` aprovou os dois casos. Nenhum caso permaneceu pendente.
- Verificação direcionada de perfil/refinamento: 10 testes aprovados, incluindo acessibilidade das cinco seções existentes.
- Seis verificações axe da página/menu em 1440, 390 e 320 px: nenhuma violação WCAG A/AA verificada.
- O teste de leitura de documentos deixou de procurar o fragmento genérico `500`, que pode ocorrer em UUIDs. Verifica agora a ausência da propriedade `dose` e do conteúdo `500 mg`, preservando a intenção de impedir armazenamento clínico indevido.
- Capturas históricas regeneradas pelos testes foram restauradas; somente as seis evidências desta entrega são incluídas.


Branch: `feat/professional-profile-entry`, criada sobre a auditoria `509d68a`. A main permanece preservada na baseline `162b9a9`. Sem merge ou publicação nesta entrega.
