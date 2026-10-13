# ==============================================================================
# Base com Node.js 24, ffmpeg, yt-dlp e utilitários
# ==============================================================================
FROM node:24.18.0-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       python3 \
       python3-venv \
       ca-certificates \
       bash \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp

ENV PATH="/opt/yt-dlp/bin:${PATH}"
ENV YT_DLP_PATH="/opt/yt-dlp/bin/yt-dlp"
ENV FFMPEG_PATH="/usr/bin/ffmpeg"

# ==============================================================================
# Builder do Backend
# ==============================================================================
FROM base AS backend-builder
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/prisma ./prisma
RUN DATABASE_URL="mysql://local:local@localhost:3306/embaixador" npm run db:generate

COPY backend/ ./
RUN npm run build

# ==============================================================================
# Builder do Frontend
# ==============================================================================
FROM base AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile

COPY frontend/ ./

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG API_PROXY_TARGET=http://127.0.0.1:8081
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN yarn build

# ==============================================================================
# Target Final: Imagem Completa e Autocontida para Google Cloud Run
# Frontend Next.js na porta $PORT e Backend Express na porta interna 8081
# ==============================================================================
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV INTERNAL_BACKEND_PORT=8081
ENV MEDIA_TEMP_DIRECTORY=/tmp/embaixador
ENV YT_DLP_PATH=/opt/yt-dlp/bin/yt-dlp
ENV YT_DLP_PROXY=""
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY --from=backend-builder /app/backend /app/backend
COPY --from=frontend-builder /app/frontend /app/frontend

# Script de inicialização autocontido gerado diretamente no build
RUN printf '%s\n' \
  '#!/bin/bash' \
  'set -e' \
  'mkdir -p "${MEDIA_TEMP_DIRECTORY:-/tmp/embaixador}"' \
  'if [ "${RUN_MIGRATIONS:-true}" = "true" ] && [ -n "$DATABASE_URL" ]; then' \
  '  echo "==> [Cloud Run] Executando migrações do banco (Prisma)..."' \
  '  (cd /app/backend && npm run db:migrate:deploy) || echo "==> [Aviso] Falha nas migrações"' \
  'fi' \
  'PUBLIC_PORT="${PORT:-8080}"' \
  'INTERNAL_PORT="${INTERNAL_BACKEND_PORT:-8081}"' \
  'echo "==> [Cloud Run] Iniciando Backend na porta interna $INTERNAL_PORT..."' \
  '(export PORT="$INTERNAL_PORT" MEDIA_TEMP_DIRECTORY="${MEDIA_TEMP_DIRECTORY:-/tmp/embaixador}" YT_DLP_PATH="${YT_DLP_PATH:-/opt/yt-dlp/bin/yt-dlp}" FFMPEG_PATH="${FFMPEG_PATH:-/usr/bin/ffmpeg}"; cd /app/backend && exec npm start) &' \
  'BACKEND_PID=$!' \
  'echo "==> [Cloud Run] Iniciando Frontend na porta $PUBLIC_PORT..."' \
  '(export PORT="$PUBLIC_PORT" API_PROXY_TARGET="http://127.0.0.1:$INTERNAL_PORT"; cd /app/frontend && exec ./node_modules/.bin/next start --port "$PUBLIC_PORT" --hostname 0.0.0.0) &' \
  'FRONTEND_PID=$!' \
  'trap "kill -TERM \$FRONTEND_PID \$BACKEND_PID 2>/dev/null || true; wait \$FRONTEND_PID \$BACKEND_PID 2>/dev/null || true; exit 0" SIGTERM SIGINT' \
  'wait -n $FRONTEND_PID $BACKEND_PID 2>/dev/null || true' \
  'kill -TERM $FRONTEND_PID $BACKEND_PID 2>/dev/null || true' \
  'wait $FRONTEND_PID $BACKEND_PID 2>/dev/null || true' \
  > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
