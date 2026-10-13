#!/bin/bash
set -e

# Se um comando customizado for passado como argumento (ex: npm run db:migrate:deploy), executa diretamente
if [ "$#" -gt 0 ] && [ "$1" != "start" ]; then
  if [ -d "/app/backend" ]; then
    cd /app/backend
  fi
  exec "$@"
fi

# Cria diretório temporário para arquivos de mídia
MEDIA_DIR="${MEDIA_TEMP_DIRECTORY:-/tmp/embaixador}"
mkdir -p "$MEDIA_DIR"

# Aplica migrações no banco de dados se RUN_MIGRATIONS estiver ativado (padrão true se DATABASE_URL existir)
if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -n "$DATABASE_URL" ]; then
  echo "==> [Cloud Run] Executando migrações do banco de dados (Prisma)..."
  (cd /app/backend && npm run db:migrate:deploy) || {
    echo "==> [ERRO] Falha ao aplicar migrações no banco de dados."
    exit 1
  }
fi

# Portas: PORT é injetada pelo Cloud Run (padrão 8080) para o tráfego público (Frontend)
PUBLIC_PORT="${PORT:-8080}"
INTERNAL_PORT="${INTERNAL_BACKEND_PORT:-8081}"

echo "==> [Cloud Run] Iniciando Backend na porta interna ${INTERNAL_PORT}..."
(
  export PORT="${INTERNAL_PORT}"
  cd /app/backend
  exec npm start
) &
BACKEND_PID=$!

echo "==> [Cloud Run] Iniciando Frontend Next.js na porta ${PUBLIC_PORT}..."
(
  export PORT="${PUBLIC_PORT}"
  export API_PROXY_TARGET="http://127.0.0.1:${INTERNAL_PORT}"
  cd /app/frontend
  exec ./node_modules/.bin/next start --port "${PUBLIC_PORT}" --hostname 0.0.0.0
) &
FRONTEND_PID=$!

shutdown() {
  echo "==> [Cloud Run] Encerrando processos..."
  kill -TERM "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  exit 0
}

trap shutdown SIGTERM SIGINT

wait -n "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
shutdown
