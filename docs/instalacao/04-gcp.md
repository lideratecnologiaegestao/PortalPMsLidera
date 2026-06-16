# 04 — Deploy no Google Cloud Platform (GCP)

> **Público-alvo:** DevOps / SRE responsável por provisionar e operar o Portal de Prefeitura em produção na GCP.
> **Pré-requisitos lidos:** `01-visao-geral.md`, `02-variaveis-ambiente.md`, `03-docker-compose.md`, `docs/12-infraestrutura.md`.
> **Data:** 2026-06 · Versão da stack: NestJS 10, Next.js 14, PostgreSQL 16 + PostGIS, Redis 7, BullMQ 5.

---

## Sumário

1. [Visão geral e diagrama de arquitetura](#1-visão-geral-e-diagrama-de-arquitetura)
2. [APIs e recursos GCP a ativar](#2-apis-e-recursos-gcp-a-ativar)
3. [Mapeamento de componentes → serviços GCP](#3-mapeamento-de-componentes--serviços-gcp)
4. [Passo a passo de implantação (gcloud CLI)](#4-passo-a-passo-de-implantação-gcloud-cli)
5. [Operação: backups, logs, monitoramento e custos](#5-operação-backups-logs-monitoramento-e-custos)
6. [Atualização de versão (rollout)](#6-atualização-de-versão-rollout)
7. [Troubleshooting](#7-troubleshooting)
8. [Checklist de segurança](#8-checklist-de-segurança)

---

## 1. Visão geral e diagrama de arquitetura

### 1.1 Resumo executivo

O Portal de Prefeitura é uma plataforma **SaaS multi-tenant**: um único deployment serve N prefeituras, cada uma com domínio, identidade visual e dados isolados por **Row Level Security (RLS)** no PostgreSQL. Na GCP a infraestrutura usa serviços gerenciados para eliminar overhead operacional:

| Camada | Serviço GCP |
|--------|-------------|
| Computação | Cloud Run (serverless containers) |
| Banco relacional | Cloud SQL for PostgreSQL 16 |
| Cache / filas | Memorystore for Redis 7 |
| Object storage | Cloud Storage (GCS) |
| Segredos | Secret Manager |
| Borda / WAF | Cloud Load Balancing + Cloud Armor |
| Registry | Artifact Registry |
| CI/CD | Cloud Build |
| DNS | Cloud DNS |
| Rede privada | VPC + Serverless VPC Access |

### 1.2 Diagrama de arquitetura

```mermaid
graph TB
    subgraph Internet
        Cidadao["Cidadão / Gestor\n(browser / app mobile)"]
        CloudflareDNS["Cloudflare / Cloud DNS\n*.prefeitura.app.br"]
    end

    subgraph GCP_Edge["GCP — Borda"]
        LB["Cloud Load Balancing\nHTTPS (443)\nManaged SSL Certificate"]
        Armor["Cloud Armor WAF\n(rate-limit, geo-block, OWASP)"]
    end

    subgraph GCP_Compute["GCP — Cloud Run (região us-east1)"]
        WebSvc["portal-web\nNext.js 14 :3000\n(SSR / ISR)"]
        ApiSvc["portal-api\nNestJS 10 :3001\n/api/*"]
    end

    subgraph GCP_Data["GCP — Dados (VPC privada)"]
        CloudSQL["Cloud SQL\nPostgreSQL 16 + PostGIS\n(portal_app NOBYPASSRLS)"]
        Redis["Memorystore Redis 7\nSTANDARD_HA\n(BullMQ filas + cache)"]
        GCS["Cloud Storage\nbucket: portal\n(uploads, assets, PDFs)"]
    end

    subgraph GCP_Infra["GCP — Infraestrutura"]
        SecretMgr["Secret Manager\n(JWT, CPF_PEPPER,\nDB passwords, API keys)"]
        ArtifactReg["Artifact Registry\n(imagens Docker)"]
        CloudBuild["Cloud Build\n(CI/CD pipeline)"]
        VPCConn["Serverless VPC Access\nConnector (10.8.0.0/28)"]
    end

    Cidadao --> CloudflareDNS
    CloudflareDNS --> LB
    LB --> Armor
    Armor --> WebSvc
    Armor --> ApiSvc
    WebSvc -->|"/api/*\nserver-side"| ApiSvc
    ApiSvc --> VPCConn
    VPCConn --> CloudSQL
    VPCConn --> Redis
    ApiSvc --> GCS
    ApiSvc --> SecretMgr
    ArtifactReg --> WebSvc
    ArtifactReg --> ApiSvc
    CloudBuild --> ArtifactReg

    style GCP_Edge fill:#e8f4fd,stroke:#1a73e8
    style GCP_Compute fill:#e6f4ea,stroke:#34a853
    style GCP_Data fill:#fce8e6,stroke:#ea4335
    style GCP_Infra fill:#fef7e0,stroke:#fbbc04
```

### 1.3 Decisões de design

- **Cloud Run em vez de GKE** para o MVP: sem necessidade de gerenciar nós, escala a zero fora do horário comercial, custo proporcional ao uso. Para carga >1.000 req/s simultâneos ou necessidade de DaemonSets (ex.: pgbouncer sidecar), migre para **GKE Autopilot** (veja seção 3.1).
- **IP privado para banco e Redis**: Cloud SQL e Memorystore ficam acessíveis apenas via VPC interna; Cloud Run acessa via Serverless VPC Access Connector. Nunca exposto à internet.
- **RLS preservada**: o usuário da aplicação (`portal_app`) é `NOSUPERUSER NOBYPASSRLS`. O `cloudsqlsuperuser` do Cloud SQL **não é** superusuário PostgreSQL real — a GCP remove esse privilégio para não contornar RLS. Veja seção 3.2.
- **Gateway único**: o frontend Next.js jamais acessa banco, Redis ou GCS diretamente. Toda I/O passa pela API NestJS.
- **Secret Manager**: nenhum segredo em variável de ambiente plaintext no Cloud Run; todos injetados via referência a versão do Secret Manager.

---

## 2. APIs e recursos GCP a ativar

Execute o bloco abaixo **uma única vez** após criar o projeto:

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  servicenetworking.googleapis.com \
  vpcaccess.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  storage-component.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  dns.googleapis.com \
  compute.googleapis.com \
  certificatemanager.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  cloudtrace.googleapis.com
```

### Tabela detalhada

| API / Recurso | Nome no console | Por que é necessária |
|---|---|---|
| **Cloud Run API** | `run.googleapis.com` | Executa os containers da API NestJS e do portal Next.js como serviços serverless gerenciados. |
| **Cloud SQL Admin API** | `sqladmin.googleapis.com` | Cria e gerencia a instância PostgreSQL 16 + PostGIS, backups, usuários e flags de banco. |
| **Service Networking API** | `servicenetworking.googleapis.com` | Habilita o peering de VPC privado necessário para o Cloud SQL e o Memorystore usarem IPs internos (Private Service Access). |
| **Serverless VPC Access API** | `vpcaccess.googleapis.com` | Cria o conector que permite ao Cloud Run alcançar recursos na VPC privada (banco, Redis) sem IP público. |
| **Memorystore Redis API** | `redis.googleapis.com` | Provisiona o Redis 7 gerenciado para filas BullMQ e cache de sessão/tenant. |
| **Cloud Storage** | `storage.googleapis.com` + `storage-component.googleapis.com` | Armazena uploads dos cidadãos (fotos de denúncias, PDFs de manifestações, assets do CMS) com interoperabilidade S3. |
| **Secret Manager** | `secretmanager.googleapis.com` | Armazena e rotaciona segredos (JWT, CPF_PEPPER, senhas DB, chaves de API). Injetados no Cloud Run via referência — nunca plaintext. |
| **Artifact Registry** | `artifactregistry.googleapis.com` | Registry Docker privado para armazenar as imagens `portal/api` e `portal/web` geradas pelo CI/CD. Substitui o Container Registry legado. |
| **Cloud Build** | `cloudbuild.googleapis.com` | Pipeline de CI/CD: build das imagens Docker, push para Artifact Registry, deploy no Cloud Run. |
| **Cloud DNS** | `dns.googleapis.com` | Gerencia zonas DNS para `*.prefeitura.app.br` e subdomínios de cada prefeitura. Alternativa: Cloudflare gerenciado externamente. |
| **Compute Engine / VPC** | `compute.googleapis.com` | Provê a VPC, subnets, Cloud Router, Cloud NAT, e o backend do Load Balancer (serverless NEGs). |
| **Certificate Manager** | `certificatemanager.googleapis.com` | Emite e renova certificados TLS gerenciados para o domínio principal e wildcard `*.prefeitura.app.br`. |
| **Cloud Armor** | (parte de `compute.googleapis.com`) | WAF gerenciado: regras OWASP Top 10, rate limiting por IP, geo-blocking. Protege a borda antes de atingir o Cloud Run. |
| **IAM** | `iamcredentials.googleapis.com` | Gerencia service accounts, workload identity e permissões mínimas por serviço (princípio do menor privilégio). |
| **Cloud Logging** | `logging.googleapis.com` | Coleta logs estruturados dos Cloud Run services, Cloud SQL (pgaudit) e Cloud Build. |
| **Cloud Monitoring** | `monitoring.googleapis.com` | Métricas de latência, erro rate, instâncias ativas, uso de CPU/memória. Alertas por e-mail/PagerDuty. |
| **Cloud Trace** | `cloudtrace.googleapis.com` | Distributed tracing para rastrear requisições entre portal-web → portal-api → Cloud SQL. |

---

## 3. Mapeamento de componentes → serviços GCP

### 3.1 API NestJS + Portal Next.js → Cloud Run

**Serviço `portal-api`** (NestJS 10):
- Imagem: `us-east1-docker.pkg.dev/PROJECT/portal/api:TAG`
- Porta: **3001**, rota de saúde: `GET /api/health/ready`
- Variáveis não-secretas: `PORT=3001`, `NODE_ENV=production`, `REDIS_DB=1`, `BULLMQ_PREFIX=portal`, `STORAGE_ENDPOINT=https://storage.googleapis.com`, `STORAGE_FORCE_PATH_STYLE=true`
- Variáveis secretas (via Secret Manager): `DATABASE_URL`, `DATABASE_URL_READONLY`, `REDIS_HOST`, `REDIS_PASSWORD`, `AUTH_JWT_SECRET`, `CPF_PEPPER`, `ANTHROPIC_API_KEY`, etc.
- Concorrência: 80 req/instância (padrão Cloud Run); ajuste conforme perfil de carga.
- `ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (não aceita tráfego direto da internet).

**Serviço `portal-web`** (Next.js 14):
- Imagem: `us-east1-docker.pkg.dev/PROJECT/portal/web:TAG`
- Porta: **3000**
- Variáveis: `NODE_ENV=production`, `API_URL=https://api.prefeitura.app.br` (ou URL interna Cloud Run)
- SSR e ISR são suportados nativamente; para ISR com On-Demand Revalidation configure `NEXT_REVALIDATE_TOKEN`.

**Alternativas:**
- **GKE Autopilot**: preferível quando há necessidade de workers BullMQ como Deployments separados, sidecars (pgbouncer, fluent-bit), ou HPA por CPU. Adiciona complexidade operacional mas dá mais controle.
- **Compute Engine (VM)**: opção para migração lift-and-shift do ambiente Docker Compose existente (Lidera WSL2). Use se a equipe não tiver experiência com containers gerenciados. Porém perde escala automática e zero-downtime deploy.

### 3.2 PostgreSQL 16 + PostGIS → Cloud SQL

**Instância recomendada:** `db-custom-2-4096` (2 vCPU, 4 GB RAM) para início; escale verticalmente conforme crescimento.

**Configurações críticas:**
- `ip_configuration.ipv4_enabled = false` — sem IP público.
- `ip_configuration.private_network = "projects/PROJECT/global/networks/portal-vpc"` — acesso apenas via VPC.
- `backup_configuration.enabled = true` com `point_in_time_recovery = true` (PITR até 7 dias).
- Flags: `max_connections=200`, `cloudsql.enable_pgaudit=on`, `log_min_duration_statement=1000` (loga queries >1s).

**Usuários e RLS — ponto crítico:**
```sql
-- Executar via Cloud SQL Auth Proxy após provisionamento
-- 1. Instalar extensão PostGIS (requer usuário privilegiado)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector; -- pgvector para embeddings IA

-- 2. Criar usuários da aplicação SEM superusuário e SEM bypass RLS
-- O cloudsqlsuperuser do Cloud SQL NÃO tem SUPERUSER real no PostgreSQL,
-- portanto RLS é respeitada mesmo por ele. Isso é uma proteção adicional da GCP.
CREATE ROLE portal_app
  WITH LOGIN PASSWORD 'NUNCA_AQUI_USE_SECRET_MANAGER'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

CREATE ROLE portal_ro
  WITH LOGIN PASSWORD 'NUNCA_AQUI_USE_SECRET_MANAGER'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- 3. Conceder permissões mínimas
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO portal_ro;
```

> **ATENÇÃO RLS:** O `PrismaService` da API executa `SET LOCAL app.current_tenant_id = 'uuid'` no início de cada transação. As policies de RLS nas tabelas filtram por `current_setting('app.current_tenant_id')`. Se a conexão não setar esse parâmetro (ex.: migrations, seeds), ela verá todas as linhas — use `prisma.platform()` nesses casos e nunca exponha essa conexão ao tráfego do usuário final.

### 3.3 Redis 7 → Memorystore for Redis

- **Tier:** `STANDARD_HA` para produção (failover automático, SLA 99,9%).
- **Tier:** `BASIC` para staging/dev (sem HA, mais barato).
- **Versão:** `REDIS_7_0`.
- **Connect mode:** `PRIVATE_SERVICE_ACCESS` (IP privado na VPC).
- `memory_size_gb`: 1 GB para início; monitore `used_memory` e escale.

**Configuração da aplicação:**
```env
REDIS_HOST=10.x.x.x          # IP privado do Memorystore (output do Terraform)
REDIS_PORT=6379
REDIS_PASSWORD=               # Memorystore Redis básico sem AUTH por padrão;
                               # ative AUTH em versões >=6.0 com redis_configs.requirepass
REDIS_DB=1                    # DB lógico 1 (separado de outros usos)
REDIS_TLS=false               # Memorystore não usa TLS na VPC privada
BULLMQ_PREFIX=portal          # prefixo de todas as filas BullMQ
```

> Conexão Redis com `maxRetriesPerRequest: null` e `enableReadyCheck: false` (obrigatório para BullMQ 5 — veja `queue.constants.ts`).

### 3.4 Object Storage → Cloud Storage (GCS)

O GCS é usado como backend S3-compatível via **HMAC keys** (interoperabilidade XML API).

```env
STORAGE_ENDPOINT=https://storage.googleapis.com
STORAGE_REGION=auto
STORAGE_BUCKET=portal
STORAGE_ACCESS_KEY=GOOG1E...   # HMAC Access Key (Secret Manager)
STORAGE_SECRET_KEY=...          # HMAC Secret (Secret Manager)
STORAGE_FORCE_PATH_STYLE=true   # obrigatório para GCS com SDK S3
```

**Estrutura de prefixos no bucket `portal`:**
```
portal/
  uploads/{tenant_id}/{ano}/{mes}/{uuid}.ext   # uploads dos cidadãos
  assets/{tenant_id}/logo.png                   # identidade visual
  diario/{tenant_id}/{data}/{edicao}.pdf        # Diário Oficial
  temp/{tenant_id}/{uuid}                       # temporários (lifecycle 30 dias)
```

**Lifecycle rule:** arquivos em `temp/` são automaticamente excluídos após 30 dias (configurado no Terraform).

### 3.5 Conectividade Cloud Run → Cloud SQL / Memorystore

Cloud Run é serverless e roda fora da VPC por padrão. Para acessar Cloud SQL e Memorystore (que têm IPs privados), é necessário o **Serverless VPC Access Connector**:

```
Cloud Run → VPC Connector (10.8.0.0/28) → portal-vpc → Cloud SQL / Memorystore
```

O conector é um recurso gerenciado (`google_vpc_access_connector`) que faz bridge entre o ambiente serverless e a VPC. **Custo:** ~$0,01/hora mesmo sem tráfego — mantenha só um conector por região.

### 3.6 Borda: Load Balancing + Cloud Armor

**Fluxo de entrada:**
```
DNS (*.prefeitura.app.br) → Cloud LB (HTTPS 443) → Cloud Armor → Cloud Run
```

**URL Map** (path routing):
- `*/api/*` → backend `portal-api` (Cloud Run serverless NEG)
- `*/*` → backend `portal-web` (Cloud Run serverless NEG)

**Multi-tenancy por Host:** o Cloud LB encaminha o header `Host` (ex.: `cuiaba.prefeitura.app.br`) para o Cloud Run, que repassa à API. O middleware de tenant do NestJS extrai o subdomínio e seta o `tenant_id` via RLS.

**TLS:** `google_compute_managed_ssl_certificate` gerencia emissão e renovação automática para `prefeitura.app.br` e `*.prefeitura.app.br`.

**Cloud Armor (WAF) — regras básicas:**
- Regras pré-configuradas OWASP CRS (SQLi, XSS, RFI, LFI).
- Rate limiting: 100 req/min por IP para `/api/auth/*`; 1.000 req/min geral.
- Geo-blocking opcional (bloquear fora do Brasil se aplicável).
- Adaptive Protection (ML) para DDoS L7.

**Alternativa Cloudflare:** se o DNS já estiver no Cloudflare, use Cloudflare WAF + proxy (modo laranja) e aponte para o IP do Cloud LB. Desative o Cloud Armor para não pagar duas vezes. Configure `CF-Connecting-IP` como trusted header na API.

### 3.7 Artifact Registry + Cloud Build

**Registry:** `us-east1-docker.pkg.dev/PROJECT_ID/portal/`
- Repositório: `portal` (formato Docker)
- Imagens: `api:latest`, `api:TAG`, `web:latest`, `web:TAG`

**Build e push das imagens:**
```bash
# Autenticar Docker no Artifact Registry
gcloud auth configure-docker us-east1-docker.pkg.dev

# Build e push da API
docker build -t us-east1-docker.pkg.dev/PROJECT/portal/api:latest ./api
docker push us-east1-docker.pkg.dev/PROJECT/portal/api:latest

# Build e push do Web
docker build -t us-east1-docker.pkg.dev/PROJECT/portal/web:latest ./web
docker push us-east1-docker.pkg.dev/PROJECT/portal/web:latest
```

**Cloud Build (CI/CD):** `cloudbuild.yaml` na raiz do repositório define os steps de build, test, push e deploy. A service account `portal-cloudbuild-sa` tem permissão mínima: escrever no Artifact Registry e fazer deploy no Cloud Run.

### 3.8 Segredos → Secret Manager

**Segredos obrigatórios** (sem valores hardcoded):

| Nome no Secret Manager | Descrição |
|---|---|
| `AUTH_JWT_SECRET` | Chave HMAC-SHA256 para assinar JWTs (mínimo 32 caracteres) |
| `CPF_PEPPER` | Pepper fixo para hash de CPF (LGPD) — nunca alterar após go-live |
| `DATABASE_URL` | `postgresql://portal_app:SENHA@IP:5432/portal` |
| `DATABASE_URL_READONLY` | `postgresql://portal_ro:SENHA@IP:5432/portal` |
| `REDIS_PASSWORD` | Senha do Redis (se configurada) |
| `STORAGE_ACCESS_KEY` | HMAC Key ID para GCS |
| `STORAGE_SECRET_KEY` | HMAC Secret para GCS |
| `ANTHROPIC_API_KEY` | Chave Anthropic para IA (triagem, RAG, OCR) |
| `GOVBR_CLIENT_SECRET` | Segredo OAuth2 do Login Único gov.br |
| `SMTP_PASSWORD` | Senha do servidor de e-mail para notificações |
| `VOYAGE_API_KEY` | Chave Voyage AI para embeddings (opcional) |
| `DIARIO_SIGNING_KEY` | Chave para assinatura do Diário Oficial |
| `ICP_CERT_PASSWORD` | Senha do certificado ICP-Brasil |

---

## 4. Passo a passo de implantação (gcloud CLI)

> Tempo estimado: 60–90 minutos na primeira vez (a maior parte é aguardar provisionamento do Cloud SQL ~10 min).

### 4.1 Pré-requisitos locais

```bash
# Instalar ferramentas (macOS/Linux)
# gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Terraform >= 1.5
brew install terraform   # macOS
# ou: https://developer.hashicorp.com/terraform/downloads

# Docker (para build das imagens)
# psql (para rodar migrations via Auth Proxy)
brew install postgresql

# Cloud SQL Auth Proxy v2
curl -L https://dl.google.com/cloudsql/cloud-sql-proxy.linux.amd64 \
  -o cloud-sql-proxy && chmod +x cloud-sql-proxy
```

### 4.2 Criar projeto GCP e configurar billing

```bash
# Criar projeto (ou use um existente)
gcloud projects create portal-prefeitura-prod \
  --name="Portal Prefeitura Produção" \
  --set-as-default

# Verificar projeto ativo
gcloud config get-value project

# Vincular conta de faturamento (substitua BILLING_ACCOUNT_ID)
gcloud billing projects link portal-prefeitura-prod \
  --billing-account=BILLING_ACCOUNT_ID

# Ativar todas as APIs necessárias (seção 2)
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com \
  servicenetworking.googleapis.com vpcaccess.googleapis.com \
  redis.googleapis.com storage.googleapis.com storage-component.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com dns.googleapis.com compute.googleapis.com \
  certificatemanager.googleapis.com iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com logging.googleapis.com \
  monitoring.googleapis.com cloudtrace.googleapis.com
```

### 4.3 Build e push das imagens Docker

```bash
export PROJECT_ID="portal-prefeitura-prod"
export REGION="us-east1"
export REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/portal"

# Autenticar Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Criar o repositório no Artifact Registry (ou deixe o Terraform criar)
gcloud artifacts repositories create portal \
  --repository-format=docker \
  --location=${REGION} \
  --description="Imagens Docker do Portal de Prefeitura"

# Build da API NestJS
docker build \
  --file api/Dockerfile \
  --tag ${REGISTRY}/api:$(git rev-parse --short HEAD) \
  --tag ${REGISTRY}/api:latest \
  ./api

# Build do Web Next.js
docker build \
  --file web/Dockerfile \
  --tag ${REGISTRY}/web:$(git rev-parse --short HEAD) \
  --tag ${REGISTRY}/web:latest \
  ./web

# Push das imagens
docker push ${REGISTRY}/api:latest
docker push ${REGISTRY}/api:$(git rev-parse --short HEAD)
docker push ${REGISTRY}/web:latest
docker push ${REGISTRY}/web:$(git rev-parse --short HEAD)
```

### 4.4 Aplicar o Terraform

```bash
cd infra/terraform/gcp

# Copiar e editar o arquivo de variáveis
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
# Preencha: project_id, domain, image_api, image_web
# NÃO coloque senhas de banco aqui (use Secret Manager)

# Inicializar providers e backend
terraform init

# Revisar o plano (sem aplicar)
terraform plan -out=tfplan

# Aplicar (confirme com "yes")
terraform apply tfplan

# Salvar outputs importantes
terraform output -json > terraform-outputs.json
cat terraform-outputs.json
```

> **Nota sobre state:** em produção, configure o backend GCS (descomente o bloco `backend "gcs"` em `versions.tf`). Isso armazena o `terraform.tfstate` de forma compartilhada e com lock.

### 4.5 Popular os segredos no Secret Manager

```bash
# Função auxiliar para popular segredos
add_secret() {
  local NAME=$1
  local VALUE=$2
  echo -n "${VALUE}" | gcloud secrets versions add ${NAME} \
    --project=${PROJECT_ID} \
    --data-file=-
}

# Gerar valores seguros para segredos criptográficos
JWT_SECRET=$(openssl rand -base64 48)
CPF_PEPPER=$(openssl rand -base64 32)

# Criar as versões dos segredos (os recursos já foram criados pelo Terraform)
# IMPORTANTE: substitua os valores abaixo pelos reais

# Obter IP do Cloud SQL a partir do output do Terraform
CLOUDSQL_IP=$(terraform output -raw cloud_sql_private_ip)

add_secret "AUTH_JWT_SECRET" "${JWT_SECRET}"
add_secret "CPF_PEPPER" "${CPF_PEPPER}"
add_secret "DATABASE_URL" "postgresql://portal_app:SENHA_APP@${CLOUDSQL_IP}:5432/portal?schema=public"
add_secret "DATABASE_URL_READONLY" "postgresql://portal_ro:SENHA_RO@${CLOUDSQL_IP}:5432/portal?schema=public"
add_secret "REDIS_PASSWORD" "SENHA_REDIS_SE_CONFIGURADA"
add_secret "STORAGE_ACCESS_KEY" "GOOG1E..."
add_secret "STORAGE_SECRET_KEY" "..."
add_secret "ANTHROPIC_API_KEY" "sk-ant-..."
add_secret "GOVBR_CLIENT_SECRET" "..."
add_secret "SMTP_PASSWORD" "..."

echo "Segredos populados com sucesso."

# Verificar versões ativas
gcloud secrets list --project=${PROJECT_ID}
```

### 4.6 Rodar as migrations SQL (62 arquivos, db/001 → db/062)

As migrations são executadas via **Cloud SQL Auth Proxy**, que cria um túnel seguro local para o banco.

```bash
# Terminal 1: iniciar o proxy
INSTANCE_CONNECTION_NAME=$(terraform output -raw cloud_sql_connection_name)
./cloud-sql-proxy ${INSTANCE_CONNECTION_NAME} --port=5433 &
PROXY_PID=$!

# Aguardar o proxy iniciar
sleep 3

# Terminal 2 (ou mesmo terminal): rodar as migrations em ordem
export PGPASSWORD="SENHA_PRIVILEGIADA_PARA_MIGRATIONS"
export PGHOST=127.0.0.1
export PGPORT=5433
export PGDATABASE=portal
export PGUSER=postgres   # usuário privilegiado para criar extensões e schemas

# Criar extensões (necessário antes das migrations)
psql -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
psql -c "CREATE EXTENSION IF NOT EXISTS vector;"   # pgvector

# Criar usuários da aplicação (se não feito pelo Terraform)
psql -c "CREATE ROLE portal_app WITH LOGIN PASSWORD 'SENHA_APP' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"
psql -c "CREATE ROLE portal_ro WITH LOGIN PASSWORD 'SENHA_RO' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"

# Rodar todas as 62 migrations em ordem alfabética/numérica
for f in $(ls ../../../db/*.sql | sort); do
  echo "Applying migration: $(basename $f)"
  psql -f "$f"
  if [ $? -ne 0 ]; then
    echo "ERRO na migration $f — abortando!"
    kill $PROXY_PID
    exit 1
  fi
done

echo "Todas as 62 migrations aplicadas com sucesso!"

# Conceder permissões pós-migrations
psql -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;"
psql -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;"
psql -c "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_app;"

# Encerrar o proxy
kill $PROXY_PID
```

### 4.7 Seed do tenant inicial e usuário admin

```bash
# Iniciar o proxy novamente para o seed
./cloud-sql-proxy ${INSTANCE_CONNECTION_NAME} --port=5433 &
PROXY_PID=$!
sleep 3

# Rodar o seed via API NestJS (modo CLI) apontando para o banco local via proxy
# A DATABASE_URL deve usar 127.0.0.1:5433 para o seed
DATABASE_URL="postgresql://portal_app:SENHA_APP@127.0.0.1:5433/portal?schema=public" \
  cd ../../../api && npm run seed:tenant -- \
    --domain="exemplolandia.prefeitura.app.br" \
    --name="Prefeitura de Exemplolândia" \
    --admin-email="admin@exemplolandia.gov.br" \
    --admin-password="TROCAR_NO_PRIMEIRO_ACESSO"

kill $PROXY_PID
```

> Use sempre o tenant `exemplolandia` para testes — nunca crie tenants descartáveis nem use dados de clientes reais.

### 4.8 Configurar domínio e DNS

```bash
# Opção A: Cloud DNS (gerenciado pela GCP)
# Criar zona para o domínio principal
gcloud dns managed-zones create portal-prefeitura \
  --project=${PROJECT_ID} \
  --dns-name="prefeitura.app.br." \
  --description="Zona DNS do Portal de Prefeitura"

# Obter IP do Load Balancer
LB_IP=$(terraform output -raw load_balancer_ip)
echo "Load Balancer IP: ${LB_IP}"

# Criar registro A para o domínio principal e wildcard
gcloud dns record-sets create "prefeitura.app.br." \
  --zone=portal-prefeitura --type=A --ttl=300 --rrdatas="${LB_IP}"

gcloud dns record-sets create "*.prefeitura.app.br." \
  --zone=portal-prefeitura --type=A --ttl=300 --rrdatas="${LB_IP}"

# Obter nameservers da zona para configurar no registrador
gcloud dns managed-zones describe portal-prefeitura --format="value(nameServers)"
```

```bash
# Opção B: Cloudflare (DNS externo)
# Configure no painel do Cloudflare:
# A   prefeitura.app.br        → LB_IP (proxy ON = laranja)
# A   *.prefeitura.app.br      → LB_IP (proxy ON = laranja)
# Configure WAF do Cloudflare em vez do Cloud Armor
```

### 4.9 Verificar certificado TLS

```bash
# O certificado gerenciado pode levar 15–60 minutos para provisionar
# Aguardar status ACTIVE
watch -n 30 "gcloud compute ssl-certificates describe portal-cert \
  --project=${PROJECT_ID} \
  --format='value(managed.status)'"
```

### 4.10 Smoke tests

```bash
# Substituir por seu domínio
BASE_URL="https://api.prefeitura.app.br"

# 1. Readiness check da API
curl -sf "${BASE_URL}/api/health/ready" && echo "API: OK"

# 2. Liveness check
curl -sf "${BASE_URL}/api/health/live" && echo "API LIVE: OK"

# 3. Portal web (deve retornar HTML)
curl -sf "https://exemplolandia.prefeitura.app.br" | grep -c "<html" && echo "WEB: OK"

# 4. Verificar headers de segurança
curl -I "https://api.prefeitura.app.br/api/health/ready" | grep -E "Strict-Transport|X-Frame|X-Content"

# 5. Testar isolamento de tenant (deve retornar 404 ou 403 para tenant inexistente)
curl -sf "https://tenant-inexistente.prefeitura.app.br/api/tenant" && echo "ISOLAMENTO: FALHOU" || echo "ISOLAMENTO: OK"

# 6. Verificar que o banco aceita conexão da API (indireto via health)
curl -sf "${BASE_URL}/api/health/ready" | python3 -c "import sys,json; d=json.load(sys.stdin); print('DB:', d.get('database','N/A'))"
```

---

## 5. Operação: backups, logs, monitoramento e custos

### 5.1 Backups

**Cloud SQL — backups automáticos:**
- Backup diário automatizado: habilitado via Terraform (`backup_configuration.enabled = true`).
- Retenção: 7 dias de backups automáticos.
- **PITR (Point-in-Time Recovery):** habilitado com `point_in_time_recovery = true`. Permite restaurar para qualquer momento nos últimos 7 dias com granularidade de ~1 minuto.
- **Backup manual antes de migrations:**
  ```bash
  gcloud sql backups create \
    --instance=portal-postgres \
    --description="Pre-migration backup $(date +%Y%m%d-%H%M%S)"
  ```
- **Restauração:**
  ```bash
  # Listar backups disponíveis
  gcloud sql backups list --instance=portal-postgres

  # Restaurar para uma instância existente
  gcloud sql backups restore BACKUP_ID \
    --restore-instance=portal-postgres
  ```

**Cloud Storage — backups do bucket:**
- Configure Object Versioning para manter versões anteriores de arquivos.
- Ou configure replicação para outro bucket (região diferente) para DR.

### 5.2 Logs

**Cloud Logging — logs estruturados:**
```bash
# Ver logs da API em tempo real
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=portal-api" \
  --format="value(textPayload,jsonPayload)"

# Buscar erros nas últimas 24h
gcloud logging read \
  'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=100 \
  --freshness=24h \
  --format=json

# Logs de pgaudit (Cloud SQL — queries executadas)
gcloud logging read \
  'resource.type="cloudsql_database" AND jsonPayload.message=~"AUDIT"' \
  --limit=50
```

**Log sink para análise longa:** crie um sink para BigQuery ou Cloud Storage para retenção >30 dias (limite do Cloud Logging).

### 5.3 Monitoramento e alertas

**Dashboards recomendados no Cloud Monitoring:**
- Latência p50/p95/p99 do Cloud Run (portal-api e portal-web)
- Taxa de erro (5xx) por serviço
- Número de instâncias ativas (indicador de cold start)
- Conexões ativas no Cloud SQL
- Memória usada no Memorystore Redis
- Tamanho do bucket GCS

**Alertas obrigatórios:**
```bash
# Criar política de alerta para taxa de erro > 1%
gcloud alpha monitoring policies create \
  --policy-from-file=monitoring/error-rate-alert.json

# Criar alerta para latência p95 > 2s
# (configure via console ou Terraform com google_monitoring_alert_policy)
```

**Métricas customizadas da API:** a API NestJS expõe métricas Prometheus em `/api/metrics` (protegido por `METRICS_TOKEN`). Configure o Cloud Monitoring para scraping ou use Grafana Cloud.

### 5.4 Estimativa de custos mensais

> Valores aproximados para carga inicial (1–5 prefeituras, ~10k req/dia). Região `us-east1`.

| Serviço | Configuração | Custo estimado/mês |
|---|---|---|
| Cloud Run (API) | 1–3 instâncias, 1 vCPU, 512 MB | $10–30 |
| Cloud Run (Web) | 1–3 instâncias, 1 vCPU, 512 MB | $10–30 |
| Cloud SQL | db-custom-2-4096, SSD 20 GB | $80–120 |
| Memorystore Redis | 1 GB, STANDARD_HA | $50–70 |
| Cloud Storage | 10 GB storage + transferência | $5–15 |
| Cloud Load Balancing | regras de encaminhamento + dados | $20–40 |
| Cloud Armor | 1M req/mês + políticas | $10–20 |
| Artifact Registry | 10 GB armazenamento | $1–5 |
| Secret Manager | 10 segredos + acessos | $1–5 |
| Outros (Logging, Monitoring, DNS) | — | $5–15 |
| **Total estimado** | | **$192–350/mês** |

> Para escala de 10+ prefeituras com tráfego alto, espere $500–1.500/mês. O maior custo é o Cloud SQL — considere Cloud Spanner ou AlloyDB para escala global.

---

## 6. Atualização de versão (rollout)

### 6.1 Deploy sem downtime (rolling update)

O Cloud Run faz rollout automático sem downtime: a nova revisão recebe tráfego gradualmente enquanto a antiga permanece ativa.

```bash
# Opção A: deploy direto (100% tráfego imediato)
gcloud run deploy portal-api \
  --image=${REGISTRY}/api:NOVA_TAG \
  --project=${PROJECT_ID} \
  --region=${REGION}

# Opção B: canary deploy (10% para nova versão)
gcloud run deploy portal-api \
  --image=${REGISTRY}/api:NOVA_TAG \
  --no-traffic \
  --project=${PROJECT_ID} \
  --region=${REGION}

# Obter nome da nova revisão
NEW_REVISION=$(gcloud run revisions list \
  --service=portal-api --region=${REGION} \
  --format="value(name)" --limit=1)

# Dividir tráfego: 90% antiga, 10% nova
gcloud run services update-traffic portal-api \
  --region=${REGION} \
  --to-revisions=REVISAO_ANTIGA=90,${NEW_REVISION}=10

# Após validar, migrar 100%
gcloud run services update-traffic portal-api \
  --region=${REGION} \
  --to-latest
```

### 6.2 Migrations de banco em produção

```bash
# 1. Backup ANTES de qualquer migration
gcloud sql backups create --instance=portal-postgres \
  --description="Pre-deploy $(git rev-parse --short HEAD)"

# 2. Rodar migration via Auth Proxy (sem downtime para migrations aditivas)
./cloud-sql-proxy ${INSTANCE_CONNECTION_NAME} --port=5433 &
PROXY_PID=$!
sleep 3

# Aplicar apenas as migrations novas
for f in $(ls db/0{59,60,61,62}*.sql | sort); do
  echo "Applying: $(basename $f)"
  psql "postgresql://portal_app:SENHA@127.0.0.1:5433/portal" -f "$f"
done

kill $PROXY_PID

# 3. Deploy da nova imagem após migrations aplicadas
gcloud run deploy portal-api --image=${REGISTRY}/api:NOVA_TAG ...
```

---

## 7. Troubleshooting

### 7.1 Cloud Run não consegue conectar ao banco

**Sintoma:** `portal-api` retorna 503 ou health check `/api/health/ready` falha com erro de conexão ao banco.

**Diagnóstico:**
```bash
# Verificar se VPC connector está READY
gcloud compute networks vpc-access connectors describe portal-connector \
  --region=${REGION} --format="value(state)"

# Verificar se o Cloud Run tem o connector configurado
gcloud run services describe portal-api \
  --region=${REGION} \
  --format="value(spec.template.metadata.annotations)"

# Verificar variável DATABASE_URL
gcloud run services describe portal-api \
  --region=${REGION} \
  --format=json | jq '.spec.template.spec.containers[0].env'

# Logs de conexão
gcloud logging read \
  'resource.labels.service_name="portal-api" AND textPayload=~"connection"' \
  --limit=20 --freshness=1h
```

**Solução:** garanta que `vpc_access.connector` aponta para o conector correto e que o Cloud SQL está na mesma VPC.

### 7.2 RLS não está funcionando (dados cross-tenant visíveis)

**Sintoma:** uma prefeitura consegue ver dados de outra.

**Diagnóstico:**
```bash
# Testar via Auth Proxy — verificar policies
psql "postgresql://portal_app:SENHA@127.0.0.1:5433/portal" -c \
  "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname='public';"

# Verificar se RLS está habilitada nas tabelas
psql ... -c \
  "SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace;"
```

**Causas comuns:**
1. `SET LOCAL app.current_tenant_id` não foi chamado antes da query (bug no PrismaService).
2. Tabela nova criada sem `ALTER TABLE nome ENABLE ROW LEVEL SECURITY` + policy.
3. Conexão usando `portal_app` com `BYPASSRLS` (não deve ocorrer se criado com `NOBYPASSRLS`).

### 7.3 Redis / BullMQ com erros de conexão

**Sintoma:** workers de fila não processam jobs; logs mostram `maxRetriesPerRequest exceeded`.

**Diagnóstico:**
```bash
# Verificar se o Memorystore está READY
gcloud redis instances describe portal-redis \
  --region=${REGION} --format="value(state)"

# Verificar conectividade via Cloud Run (teste temporário)
gcloud run jobs execute test-redis-conn ...
# Ou via curl com cloud-sql-proxy equivalente para Redis: use redis-cli via container
```

**Solução:** confirme `maxRetriesPerRequest: null` e `enableReadyCheck: false` na configuração do ioredis (obrigatório para BullMQ 5).

### 7.4 Upload de arquivos falha (GCS)

**Sintoma:** uploads retornam 500 ou "SignatureDoesNotMatch".

**Causas comuns:**
1. `STORAGE_FORCE_PATH_STYLE` não está `true` — obrigatório para GCS com SDK S3.
2. HMAC keys expiradas ou revogadas — gere novas no console IAM.
3. Service account sem permissão `storage.objectAdmin` no bucket.
4. Endpoint incorreto — deve ser `https://storage.googleapis.com` (não `storage.cloud.google.com`).

### 7.5 Certificado TLS em estado PROVISIONING por muito tempo

**Causa:** o DNS ainda não propagou ou o domínio não está apontando para o IP do Load Balancer.

```bash
# Verificar status
gcloud compute ssl-certificates describe portal-cert \
  --format="value(managed.status,managed.domainStatus)"

# Verificar resolução DNS
dig +short prefeitura.app.br @8.8.8.8
dig +short "*.prefeitura.app.br" @8.8.8.8
```

O certificado só provisiona quando o DNS resolve para o IP do LB. Aguarde 5–10 minutos após corrigir o DNS.

### 7.6 Cold start lento no Cloud Run

**Sintoma:** primeira requisição após período inativo demora 5–15 segundos.

**Soluções:**
1. Configure `min_instance_count = 1` para manter pelo menos uma instância quente.
2. Use Cloud Run `startup_probe` com `initial_delay_seconds = 10` para evitar timeout prematuro.
3. Otimize o tempo de inicialização do NestJS (lazy loading de módulos, redução de imports desnecessários).

---

## 8. Checklist de segurança

Use este checklist antes de ir para produção e a cada deploy de feature sensível.

### Rede e acesso
- [ ] Cloud SQL sem IP público (`ipv4_enabled = false`)
- [ ] Memorystore Redis sem IP público (PRIVATE_SERVICE_ACCESS)
- [ ] Cloud Run com `ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` (sem acesso direto)
- [ ] Todas as comunicações internas via VPC privada
- [ ] TLS/HTTPS obrigatório em toda a borda (HSTS habilitado)
- [ ] Cloud Armor WAF ativo com regras OWASP CRS

### Identidade e segredos
- [ ] Nenhum segredo em variável de ambiente plaintext no Cloud Run
- [ ] Todos os segredos no Secret Manager referenciados por versão
- [ ] `AUTH_JWT_SECRET` ≥ 32 caracteres, gerado aleatoriamente
- [ ] `CPF_PEPPER` único por projeto, nunca alterado pós go-live
- [ ] Service accounts com permissões mínimas (princípio do menor privilégio)
- [ ] Sem `roles/owner` ou `roles/editor` em service accounts de aplicação
- [ ] Chaves HMAC do GCS armazenadas no Secret Manager

### Banco de dados e RLS
- [ ] Usuário `portal_app` com `NOSUPERUSER NOBYPASSRLS`
- [ ] RLS habilitada em TODAS as tabelas de tenant
- [ ] Policies de RLS testadas com script de isolamento (`rls-test-local-env.md`)
- [ ] Backups automáticos habilitados com PITR
- [ ] pgaudit habilitado (`cloudsql.enable_pgaudit=on`)
- [ ] Nenhuma query cross-tenant fora de `prisma.platform()`

### Aplicação
- [ ] `ALLOWED_ORIGINS` configurado com domínios permitidos (sem `*`)
- [ ] Rate limiting na API (especialmente em `/api/auth/*`)
- [ ] Headers de segurança: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`
- [ ] Upload de arquivos valida tipo MIME e tamanho máximo na API
- [ ] Logs de auditoria (`audit_log`) registrando ações sensíveis
- [ ] LGPD: base legal documentada, minimização de dados, retenção configurada

### CI/CD
- [ ] Nenhum segredo em variáveis do Cloud Build (use Secret Manager)
- [ ] SAST rodando no pipeline (ex.: Semgrep, Trivy para imagens)
- [ ] Dependências verificadas por SCA (ex.: `npm audit`)
- [ ] Imagens Docker usando base oficial slim e usuário não-root
- [ ] `terraform plan` revisado antes de `terraform apply` em produção

### Monitoramento
- [ ] Alertas de erro rate > 1% configurados
- [ ] Alertas de latência p95 > 2s configurados
- [ ] Logs estruturados com correlation ID em todas as requisições
- [ ] Runbook de incidentes documentado e testado
- [ ] Contato de emergência definido para incidentes de segurança

---

> **Próximos passos:** após o deploy inicial, veja `docs/instalacao/05-pos-deploy.md` para configuração dos tenants adicionais, integração gov.br OIDC e habilitação dos módulos de Transparência e Diário Oficial.
