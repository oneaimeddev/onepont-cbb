# Homologação (link de preview)

| Ambiente | Branch | Link | Banco |
| --- | --- | --- | --- |
| Homologação (Preview) | `homologacao` | https://prontuario-cbb-beta-git-homologacao-one-ai-dev.vercel.app | Projeto Supabase `prontuario-cbb-homologacao` |
| Produção (Beta) | `main` | https://prontuario-cbb-beta.vercel.app | Projeto Supabase `oneaimeddev's Project` |

## Fluxo de uma alteração

1. A alteração é enviada para a branch `homologacao`; a Vercel publica o preview.
2. Migrações novas são aplicadas primeiro no projeto de homologação.
3. O responsável testa no link de preview.
4. Aprovada, a mesma versão é integrada na `main`, as migrações são aplicadas na produção e a Vercel publica o Beta.

## Preparação inicial (uma vez)

1. No painel do Supabase, criar o projeto `prontuario-cbb-homologacao` na organização OneAI-Dev, região West US (Oregon). Guardar a senha do banco fora do chat.
2. Na máquina com Supabase CLI e Vercel CLI autenticados, na pasta do projeto atualizada:

   ```bash
   bash scripts/beta/homologacao.sh <referência-do-projeto>
   ```

   O script aplica as migrações, cria as variáveis de Preview da branch `homologacao` na Vercel (Supabase de homologação e, se houver no `.env.local`, a chave de IA) e cria os dados fictícios com as mesmas contas de avaliação. A senha do administrador da homologação fica em `~/.config/prontuario-cbb/homologacao-admin.json`, separada da produção.
3. Na Vercel, reimplantar o último deploy da branch `homologacao` para carregar as variáveis.

## Acesso ao preview

Links de preview da Vercel exigem login na Vercel (Vercel Authentication). Para outra pessoa testar, gere um link de compartilhamento no deploy (botão Share) ou ajuste a proteção de Preview em Settings → Deployment Protection.
