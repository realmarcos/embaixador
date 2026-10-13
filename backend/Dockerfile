FROM node:24.18.0-bookworm-slim AS development

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir yt-dlp

ENV PATH="/opt/yt-dlp/bin:${PATH}"
ENV NODE_ENV=development
ENV PORT=8080
ENV MEDIA_TEMP_DIRECTORY=/tmp/embaixador
ENV YT_DLP_PATH=/opt/yt-dlp/bin/yt-dlp
ENV YT_DLP_PROXY=""
ENV FFMPEG_PATH=/usr/bin/ffmpeg

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci

COPY --chown=node:node prisma ./prisma
RUN DATABASE_URL="mysql://local:local@localhost:3306/embaixador" npm run db:generate

COPY --chown=node:node . .
RUN mkdir -p /tmp/embaixador

EXPOSE 8080

CMD ["npm", "run", "dev"]

FROM development AS production

RUN npm run build
ENV NODE_ENV=production

CMD ["npm", "start"]