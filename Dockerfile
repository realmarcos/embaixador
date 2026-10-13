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
    && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp \
    && corepack enable \
    && corepack prepare yarn@1.22.22 --activate

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

RUN yarn build

# ==============================================================================
# Target: Backend Isolado (opcional para quem quer rodar só a API)
# ==============================================================================
FROM base AS backend-only
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=8080
ENV MEDIA_TEMP_DIRECTORY=/tmp/embaixador

COPY --from=backend-builder /app/backend ./
RUN mkdir -p /tmp/embaixador

EXPOSE 8080
CMD ["npm", "start"]

# ==============================================================================
# Target: Frontend Isolado (opcional para quem quer rodar só o Next.js)
# ==============================================================================
FROM base AS frontend-only
WORKDIR /app/frontend

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=frontend-builder /app/frontend ./

EXPOSE 8080
CMD ["./node_modules/.bin/next", "start", "--port", "8080", "--hostname", "0.0.0.0"]

# ==============================================================================
# Target Final: Produção Unificada (Padrão para Google Cloud Run)
# Frontend Next.js na porta $PORT e Backend Express na porta interna 8081
# ==============================================================================
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV INTERNAL_BACKEND_PORT=8081
ENV MEDIA_TEMP_DIRECTORY=/tmp/embaixador

COPY --from=backend-builder /app/backend /app/backend
COPY --from=frontend-builder /app/frontend /app/frontend
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /tmp/embaixador

EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["start"]
