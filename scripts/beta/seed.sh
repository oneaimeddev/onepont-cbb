#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
IFS= read -rs -p 'Senha aprovada dos seis avaliadores (digitação oculta): ' beta_password
printf '\n'
printf '%s' "$beta_password" | node scripts/beta/seed.mjs
unset beta_password
