# Embaixador

Aplicação web para analisar mídias acessíveis em plataformas suportadas, oferecer opções de formato e resolução e armazenar downloads em espaço privado por conta. O projeto também mantém histórico, preferências e prazo de retenção dos arquivos.

## Visão geral

O repositório é um monorepo com dois pacotes:

- `backend/`: API HTTP, autenticação, análise de mídia, fila/worker de downloads, histórico e acesso ao banco e ao storage.
- `frontend/`: aplicação web autenticada para análise, escolha de formato, acompanhamento de downloads e gerenciamento do histórico.
- `specs/`: especificações, decisões técnicas, contratos e tarefas de desenvolvimento.

A análise e a obtenção das mídias usam `yt-dlp`. Conversões de formato e resolução usam FFmpeg. Os arquivos concluídos são armazenados em um bucket privado compatível com S3; URLs de origem são mantidas criptografadas no banco.

## Dependências técnicas

| Área | Tecnologias |
|---|---|
| Runtime | Node.js 24.18.0 (`>=24 <25`) |
| Backend | TypeScript 6, Express 5, Prisma 6.12, MySQL |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Base UI |
| Testes | Vitest 5 no backend; runner nativo do Node.js 24 no frontend |
| Armazenamento | AWS SDK for JavaScript v3 e serviço/bucket compatível com S3 |
| Sessão e segurança | JOSE/JWT, cookies seguros, criptografia de URL de origem, validação de URL e proxy de egress |
| Ferramentas externas | `yt-dlp` e FFmpeg, instalados separadamente do npm/Yarn |
| Gerenciadores | npm no backend; Yarn 1.22.22 no frontend |

As dependências JavaScript/TypeScript estão declaradas nos manifests e lockfiles de cada pacote. `yt-dlp`, FFmpeg, MySQL e o serviço S3-compatível são dependências externas.

## Requisitos locais

- Node.js 24.18.0.
- npm compatível com Node.js 24 e Yarn 1.22.22.
- MySQL acessível pelo backend.
- Bucket privado S3-compatível e credenciais de desenvolvimento.
- Executáveis `yt-dlp` e FFmpeg acessíveis ao processo Node do backend.

Os caminhos `YT_DLP_PATH` e `FFMPEG_PATH` devem apontar para executáveis existentes e executáveis **no mesmo ambiente em que o backend roda**. Em ambientes isolados, como VS Code instalado via Flatpak, o caminho do host pode não existir dentro do sandbox; use caminhos visíveis ao processo do backend.

## Configuração

1. Instale as dependências de cada pacote:

```sh
cd backend
npm ci

cd ../frontend
yarn install --frozen-lockfile
```

2. Crie `backend/.env` a partir de [`backend/.env.example`](backend/.env.example) e configure os serviços locais. O arquivo `.env` contém segredos e não deve ser commitado.

Variáveis principais:

| Variável | Uso |
|---|---|
| `PORT` | Porta HTTP do backend; padrão `8080`. |
| `NODE_ENV` | `development`, `test` ou `production`. |
| `DATABASE_URL` | Conexão MySQL usada pelo Prisma. |
| `JWT_SIGNING_KEY` | Chave aleatória para assinatura da sessão. |
| `SOURCE_URL_ENCRYPTION_KEY` | Chave AES-256 em Base64; ao decodificar deve conter exatamente 32 bytes. |
| `FRONTEND_ORIGIN` | Origem permitida pelo CORS, por exemplo `http://localhost:3000`. |
| `S3_ENDPOINT` | Endpoint opcional para serviços compatíveis com S3. |
| `S3_REGION`, `S3_BUCKET` | Região e bucket privado. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Credenciais do bucket. |
| `MEDIA_TEMP_DIRECTORY` | Diretório temporário privado para os jobs de mídia. |
| `YT_DLP_PATH`, `FFMPEG_PATH` | Caminhos absolutos dos executáveis vistos pelo backend. |
| `NEXT_PUBLIC_API_BASE_URL` | URL base da API para o frontend; padrão `http://localhost:8080/api`. |

Gere chaves localmente e nunca as coloque neste README. Por exemplo, `openssl rand -hex 32` pode gerar uma chave de assinatura e `openssl rand -base64 32` uma chave de criptografia compatível com o requisito de 32 bytes após decodificação.

3. Gere o client Prisma e aplique as migrações em um banco de desenvolvimento:

```sh
cd backend
npm run db:generate
npm run db:migrate:status
npm run db:migrate:dev
```

Use `npm run db:migrate:deploy` para aplicar migrações em ambientes de deploy. Não use um banco de produção para desenvolvimento ou testes.

## Executar localmente

Inicie o backend em um terminal:

```sh
cd backend
npm run dev
```

Por padrão, a API fica em `http://localhost:8080/api`. O processo inicia o proxy de egress, o worker de downloads e a rotina de limpeza de mídias expiradas.

Inicie o frontend em outro terminal:

```sh
cd frontend
yarn dev
```

A aplicação fica em `http://localhost:3000`. Configure `NEXT_PUBLIC_API_BASE_URL` se a API estiver em outro endereço. O backend deve permitir essa origem em `FRONTEND_ORIGIN`.

## Ambiente local com Docker Compose

O Compose inicializa MySQL, SeaweedFS com API S3 autenticada e bucket `embaixador`, migrações Prisma, backend e frontend. FFmpeg e yt-dlp são instalados na imagem do backend, portanto não dependem de caminhos do host ou do sandbox do VS Code. O SeaweedFS é um projeto open source sob Apache 2.0; veja o [repositório oficial](https://github.com/seaweedfs/seaweedfs).

```sh
docker compose up --build -d
docker compose ps
docker compose logs -f backend frontend
```

Acesse a aplicação em `http://localhost:3000` e a API em `http://localhost:8080/api`. O MySQL é publicado na porta `3308` por padrão (altere `MYSQL_HOST_PORT` se necessário); o endpoint S3 do SeaweedFS é `http://localhost:8333`.

O Compose usa credenciais previsíveis **somente para desenvolvimento local**. Não as reutilize em ambientes compartilhados ou produção. Para personalizar, exporte as variáveis usadas em `compose.yaml` antes de executar o Compose; `JWT_SIGNING_KEY` deve ter pelo menos 32 bytes e `SOURCE_URL_ENCRYPTION_KEY` deve ser Base64 de exatamente 32 bytes.

```sh
docker compose down
```

`docker compose down` mantém os volumes nomeados. Para apagar também o banco e os objetos SeaweedFS locais, use `docker compose down -v`; essa operação é destrutiva.

## Deploy no Google Cloud Run

Para deploy em containers com banco persistente no Google Cloud Run, siga o [guia de deploy](docs/cloud-run.md). O [Compose de produção](compose.cloudrun.yaml) constrói e publica imagens para dois serviços Cloud Run; o MySQL fica no Cloud SQL, as mídias em bucket S3 privado e as migrações em um Cloud Run Job. Volumes locais do Compose não persistem dados no Cloud Run.

## Testes e qualidade

Backend:

```sh
cd backend
npm test -- --run
npm run test:coverage -- --run
npm run lint
npm run build
```

Frontend:

```sh
cd frontend
yarn test
yarn lint
yarn build
```

Testes de integração com provedores, MySQL ou S3 são opt-in e requerem serviços e credenciais de teste separados. Não aponte variáveis de teste para dados de produção.

## Segurança e mídia

- Cookies de sessão são HttpOnly e as APIs de histórico e arquivos são autenticadas e limitadas ao proprietário.
- URLs de origem são criptografadas; arquivos ficam em storage privado.
- Erros e respostas públicas não devem expor credenciais, URLs privadas ou diagnósticos brutos dos provedores.
- Baixe apenas mídias que você pode acessar e tem autorização para obter.
- `yt-dlp` e FFmpeg são executáveis externos. Revise as licenças e condições de redistribuição antes de distribuir binários.

## Documentação dos pacotes

- [Backend: configuração, API, workers e testes](backend/README.md)
- [Frontend: desenvolvimento e verificações](frontend/README.md)
- [Especificações e contratos](specs/)
