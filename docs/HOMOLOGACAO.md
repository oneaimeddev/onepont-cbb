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

## Banco de homologação (GitHub Actions)

O projeto Supabase de homologação é `bcfircabczfbfdsjtgts`. O workflow **Banco de homologação** (`.github/workflows/homologacao-db.yml`) aplica as migrações a cada push na branch `homologacao` que traga migrações novas e pode ser executado manualmente em Actions → Banco de homologação → Run workflow (branch `homologacao`), com a opção de criar os dados fictícios e as contas de avaliação.

Segredos do repositório (Settings → Secrets and variables → Actions), cadastrados pelo responsável:

- `SUPABASE_ACCESS_TOKEN`: token pessoal do Supabase (Account → Access Tokens).
- `HOMOLOG_DB_PASSWORD`: senha do banco do projeto de homologação.
- `HOMOLOG_EVALUATOR_PASSWORD`: senha das contas de avaliação da homologação.

## Variáveis do Preview na Vercel

Só para Preview e branch `homologacao`. As públicas (URL e chave anon do Supabase de homologação, modo de assinatura, modelo de IA) já estão configuradas. Os segredos são cadastrados no painel da Vercel pelo responsável:

- `SUPABASE_SERVICE_ROLE_KEY`: chave `service_role` do projeto de homologação (Supabase → Project Settings → API Keys).
- `CBB_INTELLIGENCE_API_KEY` e `CONSULTATION_VOICE_BETA`: mesmos valores da produção, se a IA e a voz devem funcionar no preview.

Depois de alterar variáveis, reimplantar o último deploy da branch `homologacao`.

Alternativa local (máquina com Supabase CLI e Vercel CLI autenticados): `bash scripts/beta/homologacao.sh bcfircabczfbfdsjtgts`.

## Acesso ao preview

Links de preview da Vercel exigem login na Vercel (Vercel Authentication). Para outra pessoa testar, gere um link de compartilhamento no deploy (botão Share) ou ajuste a proteção de Preview em Settings → Deployment Protection.
