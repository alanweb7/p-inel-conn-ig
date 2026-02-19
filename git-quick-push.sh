#!/usr/bin/env bash
set -euo pipefail

# Uso:
# ./git-quick-push.sh
# ou
# ./git-quick-push.sh "mensagem do commit"

cd "$(dirname "$0")"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Este diretório não é um repositório git."
  exit 1
fi

MSG="${1:-}"
if [[ -z "$MSG" ]]; then
  read -r -p "Mensagem do commit: " MSG
fi

if [[ -z "${MSG// }" ]]; then
  echo "❌ Mensagem de commit vazia."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "➡️  Branch atual: $BRANCH"
echo "➡️  git add ."
git add .

if git diff --cached --quiet; then
  echo "ℹ️  Nada para commit (sem mudanças staged)."
  exit 0
fi

echo "➡️  git commit -m \"$MSG\""
git commit -m "$MSG"

echo "➡️  git push origin $BRANCH"
git push origin "$BRANCH"

echo "✅ Push concluído com sucesso."
