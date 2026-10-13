FROM node:24.18.0-bookworm-slim AS development

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package.json yarn.lock ./
USER node
RUN yarn install --frozen-lockfile

COPY --chown=node:node . .

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=development

EXPOSE 3000

CMD ["yarn", "dev"]

FROM development AS production

ARG API_PROXY_TARGET
ENV API_PROXY_TARGET=${API_PROXY_TARGET}
ENV NODE_ENV=production
ENV PORT=8080

RUN yarn build

EXPOSE 8080

CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0"]