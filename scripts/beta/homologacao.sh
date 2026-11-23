#!/usr/bin/env bash
# Prepara o projeto Supabase de homologação usado pelo link de preview (branch homologacao).
# Uso: bash scripts/beta/homologacao.sh <referência-do-projeto>
# Exige Supabase CLI e Vercel CLI autenticados, como na configuração do Beta.
set -euo pipefail
cd "$(dirname "$0")/../.."
ref="${1:-}"
if [[ ! "$ref" =~ ^[a-z]{20}$ ]]; then echo "Informe a referência do projeto de homologação (20 letras)." >&2; exit 1; fi
if [[ "$ref" == "noqixverpzgvfrcybrrt" ]]; then echo "Essa é a referência da produção. Use o projeto de homologação." >&2; exit 1; fi
export CBB_TARGET=homologacao CBB_SUPABASE_PROJECT_REF="$ref"

echo "1/3 Estrutura do banco (migrações)"
IFS= read -rs -p 'Senha do banco do projeto de homologação (digitação oculta): ' SUPABASE_DB_PASSWORD; printf '\n'
export SUPABASE_DB_PASSWORD
npx --no-install supabase link --project-ref "$ref"
npx --no-install supabase db push --linked --yes
unset SUPABASE_DB_PASSWORD

echo "2/3 Configuração do Preview na Vercel (branch homologacao)"
node scripts/beta/configure.mjs

echo "3/3 Dados fictícios"
bash scripts/beta/seed.sh
echo "Homologação pronta: https://prontuario-cbb-beta-git-homologacao-one-ai-dev.vercel.app"
