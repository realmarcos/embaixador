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

Para YouTube, instale/atualize o yt-dlp com os scripts EJS compatíveis: `python -m pip install -U "yt-dlp[default]"` (use o Python/venv da sua instalação). Os dois Dockerfiles já incluem esse grupo de dependências. A análise e o download do YouTube habilitam explicitamente `--js-runtimes node:CAMINHO_DO_NODE` usando o mesmo executável Node do backend. O Node 24 da aplicação atende ao mínimo Node 22 exigido pelo yt-dlp; instalar Node sem habilitá-lo no yt-dlp não é suficiente. Veja o [guia oficial EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

Os scripts são instalados no build, sem habilitar plugins ou downloads de componentes remotos durante as solicitações. Atualize yt-dlp e EJS juntos e reconstrua a imagem/reimplante o serviço para aplicar atualizações. Isso corrige a dependência de desafios JavaScript do YouTube, mas não garante acesso a vídeos sujeitos a bloqueios, login, restrições de região ou requisitos adicionais da plataforma.

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
| `YT_DLP_PROXY` | URL opcional do proxy HTTP contratado, usada apenas na análise e download pelo yt-dlp. |
| `YT_DLP_NO_CHECK_CERTIFICATES` | `false` por padrão; `true` desativa a validação de certificados HTTPS do yt-dlp apenas para diagnóstico temporário. |
| `NEXT_PUBLIC_API_BASE_URL` | URL base da API para o frontend; padrão `http://localhost:8080/api`. |

Gere chaves localmente e nunca as coloque neste README. Por exemplo, `openssl rand -hex 32` pode gerar uma chave de assinatura e `openssl rand -base64 32` uma chave de criptografia compatível com o requisito de 32 bytes após decodificação.

### Proxy opcional para mídias

Para usar um proxy HTTP como o Bright Data, configure no `backend/.env`:

```dotenv
YT_DLP_PROXY=http://USUARIO:SENHA_URL_ENCODED@brd.superproxy.io:44445
```

Substitua os placeholders localmente. Codifique usuário e senha **separadamente** com URL encoding (por exemplo, `encodeURIComponent`): `@` vira `%40`, `:` vira `%3A`, `#` vira `%23` e `%` vira `%25`. Ajustes de país, IP ou sessão oferecidos pelo provedor podem ser feitos no usuário. Não versione essa URL nem a publique em logs.

Reinicie o backend após alterar a configuração. Remova a variável ou deixe-a vazia para desativar o proxy contratado. Valores inválidos impedem a inicialização com um erro sem credenciais. Esta versão aceita proxies `http://`, com ou sem autenticação; proxies `https://` e SOCKS5 não são suportados.

Os Dockerfiles da raiz e do backend declaram `YT_DLP_PROXY` vazia por padrão. Forneça o valor somente na execução, por exemplo com `docker run --env-file CAMINHO_DO_ENV SUA_IMAGEM`, pelo Compose ou pelo Secret Manager no Cloud Run. Não use argumentos de build nem grave credenciais no Dockerfile; o backend herda a variável fornecida ao container.

O yt-dlp recebe `--proxy` apontando para o proxy **local** de proteção, que encaminha as conexões ao serviço contratado mantendo os bloqueios de destinos privados e o IP público validado por DNS. O upstream precisa aceitar HTTP com IP na URL e `Host` original, e CONNECT para IP na porta 443. Destinos HTTPS preservam TLS/SNI e a verificação de certificados; não há interceptação TLS. A autenticação HTTP Basic entre backend e proxy contratado não é cifrada. Se o upstream falhar, a operação falha, sem tentar acesso direto.

A configuração vale para análise, download e redownload; não altera as conexões de banco, S3 ou frontend. Proxies de datacenter e rotação por requisição ainda podem ser bloqueados pelas plataformas; valide uma mídia pequena autorizada antes de usar em produção.

### Teste temporário sem validação de certificados

A opção oficial do yt-dlp é [`--no-check-certificates`](https://github.com/yt-dlp/yt-dlp#workarounds), **no plural**. Para adicioná-la às operações de análise e download, configure:

```dotenv
YT_DLP_NO_CHECK_CERTIFICATES=true
```

Reinicie/recrie o backend após alterar a variável. No Compose, configure no ambiente ou no `.env` da raiz. O backend registra um aviso ao iniciar com a opção ativa. Ausente, vazia ou `false` mantém a verificação habilitada; valores diferentes de `true` e `false` são rejeitados.

**Use somente para diagnóstico temporário:** a opção aceita certificados HTTPS inválidos, inclusive nas conexões com as plataformas e CDNs, permitindo ataques de interceptação. Não é restrita ao certificado do proxy e não desativa a criptografia TLS. Um upstream `http://` não tem certificado TLS nesse trecho; o bypass não resolve recusas CONNECT, autenticação, DNS ou falhas TCP. Ele não altera a validação TLS de Node, S3 ou do frontend nem remove a proteção local de destinos.

Depois do teste, defina `YT_DLP_NO_CHECK_CERTIFICATES=false` ou remova a variável e reinicie o backend. Corrija a cadeia de confiança/certificados em vez de manter o bypass em produção.

### Diagnóstico de erros de análise

A API mantém o envelope `error.code`, `error.message` e `error.requestId`. Falhas conhecidas de análise retornam mensagens seguras com uma ação sugerida; o cliente do frontend traduz os códigos conhecidos para português, preservando o código e o identificador para diagnóstico. Códigos desconhecidos exibem uma mensagem genérica em português, sem repassar texto arbitrário do servidor. Não são publicados stderr do yt-dlp, URLs privadas, comandos ou credenciais.

| Código | O que verificar |
|---|---|
| `MEDIA_EXTRACTOR_UNAVAILABLE` | Caminho `YT_DLP_PATH`, instalação e permissões do executável. |
| `MEDIA_ANALYSIS_TIMEOUT` | Tempo de resposta da plataforma, servidor e proxy; tente novamente. |
| `MEDIA_PROXY_AUTHENTICATION_FAILED` | Usuário, senha e URL encoding em `YT_DLP_PROXY`; reinicie/recrie o backend após alterar. |
| `MEDIA_PROXY_CONNECTION_FAILED` | Disponibilidade e configuração do proxy, incluindo suporte a CONNECT. |
| `MEDIA_AUTHENTICATION_REQUIRED` | Link público e exigência de login/verificação na plataforma; login na plataforma não é suportado pela aplicação. |
| `MEDIA_RATE_LIMITED` | Limite de requisições da plataforma; aguarde antes de tentar novamente. |
| `MEDIA_ACCESS_DENIED` | Acesso público, bloqueio de IP e restrições da região do servidor/proxy. |
| `MEDIA_UNAVAILABLE` | Mídia removida ou indisponível; confira o link. |
| `MEDIA_TLS_FAILED` | Certificados do servidor/proxy; não desative a verificação TLS. |
| `MEDIA_CONNECTION_FAILED` | DNS e conectividade do servidor/proxy. |
| `MEDIA_ANALYSIS_INVALID_RESPONSE`, `MEDIA_NO_FORMATS` | Link compatível e atualização do yt-dlp. |
| `MEDIA_ANALYSIS_FAILED` | Falha não classificada do extrator; confira acesso público, conectividade e versão do yt-dlp. |

Nos erros HTTP `5xx`, o backend registra somente código, status e `requestId` para correlacionar a resposta com os logs. Erros internos não classificados continuam como `INTERNAL_SERVER_ERROR`, sem revelar mensagens arbitrárias ou dados privados. As categorias são inferidas de diagnósticos conhecidos; não garantem uma causa específica quando o provedor não informa o motivo. Por exemplo, uma falha de túnel sem status de autenticação indica problema de proxy, não necessariamente senha incorreta.

Para falhas no proxy contratado, procure também `Media upstream proxy failed` nos logs do backend/Cloud Run. Esse registro informa `operation` (`http` ou `connect`), `reason` (`rejected`, `timeout` ou `network`), `upstreamStatus` original quando houver resposta, `providerCode` padronizado do Bright Data quando disponível e códigos de rede conhecidos como `ENOTFOUND`, `ECONNREFUSED` ou `ECONNRESET`. Não são registrados headers brutos, corpo da resposta, URL, credenciais ou destino. O código do provedor é extraído de `x-brd-err-code` ou `Proxy-Status` e pode ser consultado no [catálogo oficial de erros do Bright Data](https://docs.brightdata.com/proxy-networks/errorCatalog).

Um `502` devolvido pelo proxy local não significa necessariamente que o Bright Data estava inacessível: confira `upstreamStatus` para distinguir uma resposta de recusa de uma falha de rede. Esses eventos de proxy não possuem o `requestId` da API; compare horário e operação e evite assumir uma correlação exata quando houver solicitações simultâneas. Restrições de zona por domínio também devem ser verificadas: a proteção local envia CONNECT para o IP público validado, não para o hostname original. Não remova essa proteção nem troque portas/protocolos sem confirmar a causa.

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

Para ativar o proxy no Compose, exporte `YT_DLP_PROXY` ou configure-a no `.env` da **raiz** antes de recriar o backend com `docker compose up -d backend`. O Compose não carrega automaticamente `backend/.env`. Deixe a variável vazia e recrie o backend para desativá-la. Evite imprimir a configuração resolvida, pois ela contém segredos.

```sh
docker compose down
```

`docker compose down` mantém os volumes nomeados. Para apagar também o banco e os objetos SeaweedFS locais, use `docker compose down -v`; essa operação é destrutiva.

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
