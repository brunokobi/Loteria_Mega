#!/usr/bin/env bash
# Atualiza o historico da Loteca, registra as previsoes dos concursos abertos, confere os
# encerrados e publica (commit + push -> o Netlify faz o deploy).
# Precisa rodar numa maquina no Brasil: a API da Caixa bloqueia servidores de fora.
#
# Variaveis: ODDSPAPI_KEY (odds da semana) e, opcional, PYTHON (padrao: python3),
# lidas do ambiente ou de ~/.config/loteca/env.
set -euo pipefail
cd "$(dirname "$0")/.."
# chave e caminho do Python podem ficar num arquivo local fora do repositorio (chmod 600)
ENV_FILE="${LOTECA_ENV:-$HOME/.config/loteca/env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
PYTHON="${PYTHON:-python3}"

git checkout -q main
git pull -q --ff-only
"$PYTHON" -m loteca.registry
git add loteca.csv loteca_registro.json
if git diff --cached --quiet; then
  echo "Nada novo para publicar."
else
  git commit -q -m "Atualizar registro de previsoes da Loteca"
  git push -q
  echo "Registro publicado."
fi
