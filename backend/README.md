# Embaixador Backend

API Express para autenticação, análise e processamento assíncrono de mídias, storage privado, histórico e preferências.

## Requisitos

- Node.js `24.18.0` (faixa declarada: `>=24 <25`)
- MySQL compatível com Prisma 6.12
- Bucket S3-compatível privado
- Executáveis `yt-dlp` e FFmpeg instalados separadamente

## Configuração

Copie `.env.example` para `.env` e preencha os valores localmente. Não versione `.env` nem inclua segredos em logs.

Variáveis principais:

- `DATABASE_URL`: conexão MySQL usada pelo Prisma.
- `JWT_SIGNING_KEY`: chave UTF-8 aleatória com pelo menos 32 bytes.
- `SOURCE_URL_ENCRYPTION_KEY`: chave AES-256 codificada em base64, com exatamente 32 bytes após decodificar.
- `FRONTEND_ORIGIN`: origem exata permitida pelo CORS, incluindo esquema e porta em desenvolvimento.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: bucket privado; `S3_ENDPOINT` é usado para provedores compatíveis.
- `MEDIA_TEMP_DIRECTORY`: diretório temporário com permissão restrita ao usuário do processo.
- `YT_DLP_PATH` e `FFMPEG_PATH`: caminhos absolutos dos executáveis instalados no host.
- `PORT` e `NODE_ENV`: porta HTTP e ambiente (`development`, `test` ou `production`).

Em produção, as variáveis requeridas são validadas no boot e `FRONTEND_ORIGIN` deve ser uma origem HTTPS exata. Gere segredos fora do repositório e use um gerenciador de segredos da plataforma.

## Banco de dados

```sh
npm ci
npm run db:generate
npm run db:migrate:status
npm run db:migrate:dev
```

Para deploy, aplique migrações versionadas com `npm run db:migrate:deploy`. Não foi aplicada migração a um banco real durante o desenvolvimento desta feature.

## API e workers

```sh
npm run dev
```

A API fica em `http://localhost:8080/api`. O processo inicia o worker de downloads e o cleanup periódico de arquivos expirados; `SIGINT`/`SIGTERM` encerram os loops e desconectam Prisma/S3. Os registros de histórico permanecem após expiração; falhas de remoção ficam retryable.

Configure o backend com a origem usada pelo frontend (por padrão, `http://localhost:3000`). Mutações exigem `Origin`, e respostas de arquivo são autenticadas, owner-scoped e `private, no-store`.

## Dependências de mídia e licenças

O SDK AWS, JOSE e dependências shadcn foram aprovados para uso no projeto; veja `specs/001-download-midias-online/research.md` para o inventário e decisões registradas. `yt-dlp` e FFmpeg são executáveis externos e não são distribuídos pelo pacote npm.

O código-fonte do yt-dlp usa Unlicense, mas distribuições podem incluir componentes com licenças próprias. O build local de FFmpeg verificado habilita codecs GPL, incluindo x264/x265, embora FFmpeg também tenha partes LGPL. Não redistribua esse binário sem revisar o build e os avisos/licenças de cada componente.

O validador bloqueia hosts fora da allowlist, IPs literais e respostas DNS privadas quando configurado no bootstrap. Isso não substitui controles de egress: redirecionamentos internos do yt-dlp e DNS rebinding entre validação e conexão ainda exigem uma política de rede que impeça acesso a loopback, redes privadas, link-local e metadata endpoints.

## Qualidade

```sh
npm test -- --run
npm run lint
npm run build
```

Os testes usam adapters em memória para fluxos de serviço/HTTP. Testes contra MySQL e S3 reais dependem de serviços de teste aprovados e configurados fora deste repositório.

Para os testes opt-in de integração, configure `TEST_DATABASE_URL` para um banco descartável já migrado e `S3_TEST_BUCKET` para um bucket privado dedicado a testes, além das credenciais e endpoint S3. Os testes só escrevem uma conta aleatória e objetos sob `integration-tests/`; não aponte essas variáveis para dados de produção.

```sh
RUN_PROVIDER_INTEGRATION=true npm test -- --run
```

Sem `RUN_PROVIDER_INTEGRATION=true` e as variáveis específicas de teste, os testes de integração ficam ignorados e a suíte unitária continua isolada.