#!/usr/bin/env bash
# Skrypt do (re)wdrożenia aplikacji na VPS po zmianach w kodzie.
# Uruchamiaj z katalogu głównego repo na serwerze: bash deploy/deploy.sh
set -euo pipefail

echo "==> Pobieram najnowszy kod (git pull)"
git pull

echo "==> Instaluję zależności"
npm ci

echo "==> Synchronizuję schemat bazy danych"
npm run db:push

echo "==> Buduję aplikację produkcyjnie"
npm run build

echo "==> Przeładowuję proces PM2"
if pm2 describe trinity-trust-monitoring > /dev/null 2>&1; then
  pm2 reload ecosystem.config.js
else
  pm2 start ecosystem.config.js
  pm2 save
fi

echo "==> Gotowe. Status procesu:"
pm2 status trinity-trust-monitoring
