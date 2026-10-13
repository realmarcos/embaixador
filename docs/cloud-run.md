# Deploy no Google Cloud Run

## Arquitetura e persistencia

A aplicação é compilada e executada através de um único [Dockerfile](../Dockerfile) na raiz do projeto:
- **Container único unificado**: O Cloud Run executa um único container que contém o frontend Next.js (porta `$PORT`), o backend Express API (porta interna 8081), `yt-dlp`, FFmpeg e aplica as migrações Prisma na inicialização.
- MySQL 8.0 no **Cloud SQL**, fora do container: contas, histórico, preferências e fila de downloads permanecem íntegros entre novos deploys e reinícios.
- Mídias em um **bucket privado S3 externo**, fora do container.
- Segredos no Secret Manager; banco persistente conectado via socket Unix `/cloudsql/...`.
- O [Dockerfile](../Dockerfile) é 100% autocontido (não depende de scripts shell externos) e pode ser construído tanto localmente quanto diretamente pelo Cloud Run via `gcloud run deploy --source .`.

---

## Deploy com Dockerfile Único (Cloud Run)

O [Dockerfile](../Dockerfile) na raiz contém todas as etapas de build e runtime.

### 1. Requisitos e variáveis

```sh
gcloud auth login
export PROJECT_ID="seu-projeto"
export REGION="southamerica-east1"
export SQL_INSTANCE="embaixador-mysql"
export INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
export SERVICE_SA="embaixador-app@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

gcloud iam service-accounts create embaixador-app
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_SA}" --role=roles/cloudsql.client
```

### 2. Banco persistente no Cloud SQL

```sh
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=MYSQL_8_0 --edition=ENTERPRISE \
  --region="$REGION" --tier=db-custom-1-3840 \
  --storage-type=SSD --storage-size=10GB --storage-auto-increase \
  --assign-ip --backup-start-time=03:00 --enable-bin-log \
  --deletion-protection
gcloud sql databases create embaixador --instance="$SQL_INSTANCE"

DB_PASSWORD="$(openssl rand -hex 24)"
gcloud sql users create embaixador --instance="$SQL_INSTANCE" \
  --password="$DB_PASSWORD"
printf 'mysql://embaixador:%s@localhost/embaixador?socket=/cloudsql/%s&connection_limit=5&pool_timeout=20' \
  "$DB_PASSWORD" "$INSTANCE_CONNECTION_NAME" | \
  gcloud secrets create embaixador-database-url --replication-policy=automatic --data-file=-
unset DB_PASSWORD
```

### 3. Bucket e segredos

No Secret Manager crie os segredos do S3 e as chaves:

```sh
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create embaixador-jwt-key --replication-policy=automatic --data-file=-
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets create embaixador-source-url-key --replication-policy=automatic --data-file=-

for SECRET in embaixador-database-url embaixador-jwt-key embaixador-source-url-key \
  embaixador-s3-access-key-id embaixador-s3-secret-access-key; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SERVICE_SA}" --role=roles/secretmanager.secretAccessor
done

export S3_BUCKET="seu-bucket-privado"
export S3_REGION="sa-east-1"
```

### 4. Deploy no Cloud Run com o Dockerfile da raiz

Você pode fazer o deploy direto a partir do código-fonte (o Cloud Run usará o [Dockerfile](../Dockerfile) na raiz automaticamente):

```sh
gcloud run deploy embaixador \
  --source=. \
  --region="$REGION" \
  --execution-environment=gen2 \
  --service-account="$SERVICE_SA" \
  --allow-unauthenticated \
  --port=8080 \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets="DATABASE_URL=embaixador-database-url:1,JWT_SIGNING_KEY=embaixador-jwt-key:1,SOURCE_URL_ENCRYPTION_KEY=embaixador-source-url-key:1,S3_ACCESS_KEY_ID=embaixador-s3-access-key-id:1,S3_SECRET_ACCESS_KEY=embaixador-s3-secret-access-key:1" \
  --set-env-vars="NODE_ENV=production,FRONTEND_ORIGIN=https://example.invalid,S3_REGION=${S3_REGION},S3_BUCKET=${S3_BUCKET},RUN_MIGRATIONS=true" \
  --no-cpu-throttling \
  --min-instances=1 \
  --max-instances=2 \
  --cpu=2 \
  --memory=4Gi \
  --timeout=900s

# Atualize o FRONTEND_ORIGIN com a URL pública gerada pelo Cloud Run
export APP_URL="$(gcloud run services describe embaixador --region="$REGION" --format='value(status.url)')"
gcloud run services update embaixador --region="$REGION" \
  --update-env-vars="FRONTEND_ORIGIN=${APP_URL}"

printf 'Aplicação rodando em: %s\n' "$APP_URL"
```

O container executa `RUN_MIGRATIONS=true` para aplicar o `prisma migrate deploy` no Cloud SQL, sobe o backend na porta `8081` e o Next.js na porta `8080` (repassando `/api` internamente).

---

## Opção B: Deploy com Serviços Separados (Frontend e Backend)

Execute na raiz do repositorio, em Bash, com Docker Engine + Compose v2, Google Cloud CLI (`gcloud`) e OpenSSL instalados. Use um projeto com faturamento ativo. Sua identidade precisa poder habilitar APIs, criar Cloud SQL/Artifact Registry/contas de servico/segredos, conceder IAM, publicar imagens e implantar Cloud Run.

Os comandos criam recursos pagos. Cloud SQL e uma instancia minima do backend geram custo mesmo sem acessos. Configure alertas de orcamento; ajuste regiao e capacidade antes de executar.

```sh
gcloud auth login
export PROJECT_ID="seu-projeto"
export REGION="southamerica-east1"
export REPOSITORY="embaixador"
export SQL_INSTANCE="embaixador-mysql"
export IMAGE_TAG="$(date -u +%Y%m%d%H%M%S)"
export AR_REPOSITORY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
export INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
export BACKEND_SA="embaixador-backend@${PROJECT_ID}.iam.gserviceaccount.com"
export FRONTEND_SA="embaixador-frontend@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker --location="$REGION"
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
gcloud iam service-accounts create embaixador-backend
gcloud iam service-accounts create embaixador-frontend
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BACKEND_SA}" --role=roles/cloudsql.client
```

Se os recursos ja existirem, reutilize-os e pule os comandos `create`. Os comandos seguintes devem ser executados na mesma sessao de terminal para manter as variaveis.

## 2. Banco persistente no Cloud SQL

Exemplo inicial com MySQL 8.0, disco SSD, backup automatico e logs para recuperacao pontual. Para alta disponibilidade, avalie `--availability-type=REGIONAL`; o exemplo abaixo usa uma zona e nao e HA.

```sh
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=MYSQL_8_0 --edition=ENTERPRISE \
  --region="$REGION" --tier=db-custom-1-3840 \
  --storage-type=SSD --storage-size=10GB --storage-auto-increase \
  --assign-ip --backup-start-time=03:00 --enable-bin-log \
  --deletion-protection
gcloud sql databases create embaixador --instance="$SQL_INSTANCE"

DB_PASSWORD="$(openssl rand -hex 24)"
gcloud sql users create embaixador --instance="$SQL_INSTANCE" \
  --password="$DB_PASSWORD"
printf 'mysql://embaixador:%s@localhost/embaixador?socket=/cloudsql/%s&connection_limit=5&pool_timeout=20' \
  "$DB_PASSWORD" "$INSTANCE_CONNECTION_NAME" | \
  gcloud secrets create embaixador-database-url --replication-policy=automatic --data-file=-
unset DB_PASSWORD
```

A senha hexadecimal evita caracteres que precisariam de URL encoding. Se usar outra senha, codifique os caracteres reservados na URL. O parametro Prisma e `socket`, nao `unix_socket`. O caminho `/cloudsql/PROJECT:REGION:INSTANCE` precisa caber no limite de socket Unix do Linux (108 bytes).

A conexao usa o socket fornecido pelo Cloud Run e o Cloud SQL Auth Proxy integrado, com criptografia e IAM. Nao adicione redes autorizadas abertas (`0.0.0.0/0`); o IP publico aqui nao significa liberar acesso MySQL sem autenticacao. Se sua organizacao exigir IP privado, configure Direct VPC e a conectividade correspondente antes de adaptar este fluxo.

Cloud SQL nao e backup dos dados do Compose existente. Se precisar preservar dados locais, faca um dump consistente do MySQL e importe-o no Cloud SQL antes das migracoes. Preserve a tabela `_prisma_migrations` junto com o banco e mantenha a mesma chave de criptografia das URLs de origem. Confira backups e teste restauracao em outra instancia; nao exclua a instancia nem o banco nos proximos deploys.

## 3. Bucket privado e segredos

Na AWS, crie um bucket S3 privado, com Block Public Access habilitado e criptografia padrao SSE-S3. Crie credenciais de uma identidade dedicada, sem permissao administrativa, com `s3:PutObject`, `s3:GetObject` e `s3:DeleteObject` apenas em `arn:aws:s3:::SEU_BUCKET/media/*`. Nao use credenciais da conta root. O backend transmite os arquivos ao usuario autenticado; o bucket nao precisa de acesso publico nem CORS para o navegador.

No console **Google Secret Manager**, crie estes segredos com as credenciais desse bucket, sem espacos ou quebra de linha no valor:

| Nome do segredo | Valor |
| --- | --- |
| `embaixador-s3-access-key-id` | Access key ID da identidade S3 |
| `embaixador-s3-secret-access-key` | Secret access key da identidade S3 |

Para uma instalacao nova, gere as chaves da aplicacao diretamente no Secret Manager:

```sh
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create embaixador-jwt-key --replication-policy=automatic --data-file=-
openssl rand -base64 32 | tr -d '\n' | \
  gcloud secrets create embaixador-source-url-key --replication-policy=automatic --data-file=-

for SECRET in embaixador-database-url embaixador-jwt-key embaixador-source-url-key \
  embaixador-s3-access-key-id embaixador-s3-secret-access-key; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${BACKEND_SA}" --role=roles/secretmanager.secretAccessor
done

export S3_BUCKET="seu-bucket-privado"
export S3_REGION="sa-east-1"
```

Use a regiao real do bucket. Para Amazon S3, deixe `S3_ENDPOINT` ausente. Para outro provedor, configure o endpoint HTTPS explicitamente e valide upload, leitura, exclusao e SSE-S3 antes de liberar usuarios.

Os deploys abaixo fixam segredos na versao `1`. Ajuste o numero se os segredos ja existirem. Em novos deploys, **reutilize** o banco, bucket e chaves. Trocar `SOURCE_URL_ENCRYPTION_KEY` sem uma migracao de chaves impede descriptografar URLs antigas; nao gere uma nova chave a cada deploy.

## 4. Imagem do backend e migracoes

```sh
docker compose -f compose.cloudrun.yaml config --quiet
docker compose -f compose.cloudrun.yaml build backend
docker compose -f compose.cloudrun.yaml push backend

gcloud run jobs create embaixador-migrate \
  --image="${AR_REPOSITORY}/backend:${IMAGE_TAG}" --region="$REGION" \
  --service-account="$BACKEND_SA" \
  --set-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets=DATABASE_URL=embaixador-database-url:1 \
  --command=npm --args=run,db:migrate:deploy \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=600s

gcloud run jobs execute embaixador-migrate --region="$REGION" --wait
```

Continue somente se o job terminar com sucesso. A imagem mantem o CLI Prisma para permitir `migrate deploy`; ela executa JavaScript compilado em producao, sem watcher. Migracoes nao rodam na inicializacao de cada replica. Nunca use `migrate dev`, `migrate reset` ou `db push` em producao.

## 5. Deploy do backend

Inicialmente use uma origem HTTPS provisoria, nao acessada por usuarios. Depois do deploy do frontend, substitua-a pela URL real.

```sh
gcloud run deploy embaixador-backend \
  --image="${AR_REPOSITORY}/backend:${IMAGE_TAG}" --region="$REGION" \
  --execution-environment=gen2 --service-account="$BACKEND_SA" \
  --allow-unauthenticated --port=8080 \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --set-secrets="DATABASE_URL=embaixador-database-url:1,JWT_SIGNING_KEY=embaixador-jwt-key:1,SOURCE_URL_ENCRYPTION_KEY=embaixador-source-url-key:1,S3_ACCESS_KEY_ID=embaixador-s3-access-key-id:1,S3_SECRET_ACCESS_KEY=embaixador-s3-secret-access-key:1" \
  --set-env-vars="NODE_ENV=production,FRONTEND_ORIGIN=https://example.invalid,S3_REGION=${S3_REGION},S3_BUCKET=${S3_BUCKET},MEDIA_TEMP_DIRECTORY=/tmp/embaixador,YT_DLP_PATH=/opt/yt-dlp/bin/yt-dlp,FFMPEG_PATH=/usr/bin/ffmpeg" \
  --no-cpu-throttling --min-instances=1 --max-instances=1 \
  --cpu=2 --memory=4Gi --concurrency=8 --timeout=900s

export API_PROXY_TARGET="$(gcloud run services describe embaixador-backend \
  --region="$REGION" --format='value(status.url)')"
curl --fail "$API_PROXY_TARGET/"
```

`--allow-unauthenticated` libera acesso HTTP ao servico na camada IAM; os endpoints privados continuam exigindo o cookie da aplicacao. O proxy Next.js nao emite identity tokens do Google, portanto nao configure o backend como IAM-only sem implementar esse mecanismo. CORS nao substitui autenticacao.

O worker atual roda no mesmo processo da API, fora das requisicoes HTTP. Por isso, mantenha **CPU sempre alocada** (`--no-cpu-throttling`) e **ao menos uma instancia**. O limite inicial de uma instancia contem custo e concorrencia; nao e garantia de ausencia de sobreposicao de instancias/revisoes durante deploys.

`/tmp` e efemero e ocupa memoria no Cloud Run. Dimensione a RAM para Node, yt-dlp, FFmpeg, arquivo original e convertido simultaneamente; 4 GiB e apenas um ponto de partida, nao garante processamento de midias grandes. O timeout HTTP nao estende a vida de um worker.

## 6. Imagem e deploy do frontend

Construa somente depois de obter a URL do backend, sem `/` no final. O rewrite e a variavel `NEXT_PUBLIC_API_BASE_URL` sao incorporados durante o build. Se mudar a URL do backend, reconstrua o frontend.

```sh
test -n "$API_PROXY_TARGET" || exit 1
docker compose -f compose.cloudrun.yaml build frontend
docker compose -f compose.cloudrun.yaml push frontend

gcloud run deploy embaixador-frontend \
  --image="${AR_REPOSITORY}/frontend:${IMAGE_TAG}" --region="$REGION" \
  --service-account="$FRONTEND_SA" --allow-unauthenticated --port=8080 \
  --cpu=1 --memory=512Mi --min-instances=0 --max-instances=3 --timeout=900s

export FRONTEND_ORIGIN="$(gcloud run services describe embaixador-frontend \
  --region="$REGION" --format='value(status.url)')"
gcloud run services update embaixador-backend --region="$REGION" \
  --update-env-vars="FRONTEND_ORIGIN=${FRONTEND_ORIGIN}"

printf 'Aplicacao: %s\n' "$FRONTEND_ORIGIN"
```

Abra essa URL HTTPS, cadastre uma conta, faca login, analise uma midia curta autorizada, conclua o download e confira historico, leitura do arquivo e exclusao. Confirme no navegador que as chamadas usam `/api` na origem do frontend, que o cookie tem `Secure`/`HttpOnly` e que nao ha erros CORS.

## 7. Proximos deploys e verificacao de persistencia

Nao repita a criacao dos recursos nem regenere chaves. Exporte as mesmas variaveis e uma **nova** `IMAGE_TAG`, reconstrua/publice as imagens e atualize o job:

```sh
gcloud run jobs update embaixador-migrate --region="$REGION" \
  --image="${AR_REPOSITORY}/backend:${IMAGE_TAG}"
gcloud run jobs execute embaixador-migrate --region="$REGION" --wait
```

Depois do sucesso, repita os deploys dos servicos com as novas imagens. No backend, use a `FRONTEND_ORIGIN` real no lugar de `https://example.invalid`. Planeje migracoes compativeis com a revisao anterior durante a transicao e faca backup antes de alteracoes destrutivas. Evite executar jobs de migracao concorrentes.

Verificacoes obrigatorias no seu projeto:

1. Crie uma conta e um download; anote historico e preferencias.
2. Implante uma nova revisao sem alterar a conexao Cloud SQL, o bucket ou as chaves.
3. Entre novamente e confirme conta, historico e preferencias preservados. Antes de expirar a retencao, confirme que o arquivo ainda pode ser baixado.
4. Exclua um download e confirme a remocao do objeto; valide tambem a limpeza apos a retencao configurada.
5. Confira backups automaticos, recuperacao pontual e protecao de exclusao no console Cloud SQL.

```sh
gcloud run services logs read embaixador-backend --region="$REGION" --limit=50
gcloud run services logs read embaixador-frontend --region="$REGION" --limit=50
gcloud run jobs executions list --job=embaixador-migrate --region="$REGION"
```

O endpoint `/` confirma apenas que a API abriu a porta, nao que banco e storage funcionam. O cadastro e o ciclo completo de download verificam essas dependencias. Nao registre valores dos segredos em logs.

## Limites da arquitetura atual

A persistencia de registros e midias concluidas e independente do Cloud Run. Entretanto, uma instancia pode ser encerrada durante um download mesmo com instancia minima. O worker atual nao possui lease/heartbeat para recuperar automaticamente um job abandonado em `PROCESSING`; deploys e falhas podem exigir tratamento manual desse job. Evite deploys durante processamento e nao prometa entrega garantida apenas com estas configuracoes.

Para execucao duravel com recuperacao automatica, sera necessario evoluir o processamento para Cloud Run Jobs/Cloud Tasks ou um worker com leases e retries. Isso nao esta incluido neste fluxo de containerizacao. Para midias grandes, teste tambem limites de streaming e memoria no proxy frontend e na API. Plataformas de origem podem bloquear IPs de datacenter; valide yt-dlp na regiao real do deploy.

## Referencias

- [Cloud Run conectado ao Cloud SQL MySQL](https://docs.cloud.google.com/sql/docs/mysql/connect-run)
- [CPU e faturamento por instancia](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Segredos no Cloud Run](https://docs.cloud.google.com/run/docs/configuring/secrets)
- [Execucao de Cloud Run Jobs](https://docs.cloud.google.com/run/docs/execute/jobs)