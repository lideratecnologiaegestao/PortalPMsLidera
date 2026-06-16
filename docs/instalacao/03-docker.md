# 03 — Manual de Instalação: Docker / Docker Compose

> **Público-alvo:** operador da Lidera que vai subir o Portal de Prefeitura pela primeira vez ou fazer manutenção.
>
> Este manual cobre dois ambientes: **desenvolvimento local** (tudo isolado na máquina) e **produção** (Servidor Lidera, que já tem Redis e Evolution API — o portal provisiona apenas o que falta). Leia as seções na ordem; os comandos são para copiar e colar.

---

## Índice

1. [Pré-requisitos](#1-pré-requisitos)
2. [Desenvolvimento local](#2-desenvolvimento-local)
   - 2.1 [Clonar e configurar variáveis](#21-clonar-e-configurar-variáveis)
   - 2.2 [Subir os serviços](#22-subir-os-serviços)
   - 2.3 [O que cada serviço faz e suas portas](#23-o-que-cada-serviço-faz-e-suas-portas)
   - 2.4 [Verificar saúde dos serviços](#24-verificar-saúde-dos-serviços)
   - 2.5 [Migrations manuais (quando necessário)](#25-migrations-manuais-quando-necessário)
3. [Produção — Servidor Lidera](#3-produção--servidor-lidera)
   - 3.1 [Modelo de rede e o que reusar](#31-modelo-de-rede-e-o-que-reusar)
   - 3.2 [Criar os papéis de banco](#32-criar-os-papéis-de-banco)
   - 3.3 [Criar o bucket MinIO e usuário de acesso](#33-criar-o-bucket-minio-e-usuário-de-acesso)
   - 3.4 [Configurar o arquivo .env.prod](#34-configurar-o-arquivo-envprod)
   - 3.5 [Subir o stack de produção](#35-subir-o-stack-de-produção)
   - 3.6 [Rodar as migrations no banco de produção](#36-rodar-as-migrations-no-banco-de-produção)
4. [Build e publicação das imagens](#4-build-e-publicação-das-imagens)
5. [Operação](#5-operação)
   - 5.1 [Ver logs](#51-ver-logs)
   - 5.2 [Backups](#52-backups)
   - 5.3 [Atualização (nova release)](#53-atualização-nova-release)
   - 5.4 [Reiniciar um serviço](#54-reiniciar-um-serviço)
   - 5.5 [Escalar workers](#55-escalar-workers)
6. [Reverse proxy: Nginx + Cloudflare](#6-reverse-proxy-nginx--cloudflare)
7. [Pós-instalação](#7-pós-instalação)
8. [Troubleshooting](#8-troubleshooting)
9. [Checklist de segurança](#9-checklist-de-segurança)

---

## 1. Pré-requisitos

### Desenvolvimento local

| Requisito | Versão mínima | Como instalar |
|-----------|---------------|---------------|
| Docker Desktop (Windows/macOS) ou Docker Engine (Linux) | 24.x | https://docs.docker.com/get-docker/ |
| Docker Compose plugin (`docker compose`) | v2.20+ | incluído no Docker Desktop; Linux: `apt install docker-compose-plugin` |
| Git | qualquer recente | https://git-scm.com |

Verifique antes de continuar:

```bash
docker --version
# Docker version 24.x.x

docker compose version
# Docker Compose version v2.x.x
```

> ⚠️ **Windows (WSL2):** execute todos os comandos deste manual dentro do terminal WSL2 (Ubuntu), não no PowerShell/CMD. Scripts shell (`.sh`) e o heredoc das migrations não funcionam no PowerShell.

### Produção (Servidor Lidera)

O servidor já roda **Windows Server 2022 com WSL2/Ubuntu + Docker**. Além dos requisitos acima, certifique-se de que:

- A rede Docker `evolution-net` existe (`docker network ls | grep evolution-net`).
- O Redis já está no ar (container `redis` na rede `evolution-net`).
- O Evolution API já está no ar (container `evolution-api` na mesma rede), caso vá usar WhatsApp.
- Há espaço em disco suficiente para os volumes (banco + storage). Mínimo recomendado: 40 GB livres.
- O `cloudflared` está configurado com o túnel Cloudflare Zero Trust ativo.

---

## 2. Desenvolvimento local

### 2.1 Clonar e configurar variáveis

```bash
# 1. Clonar o repositório
git clone https://github.com/sua-org/portal-prefeitura.git
cd portal-prefeitura

# 2. Copiar o template de variáveis
cp .env.example .env

# 3. Editar o .env se necessário
# Em dev os defaults (DB_PASSWORD=portal) já funcionam sem alteração.
# Para testar integrações (gov.br, WhatsApp, IA) preencha as chaves correspondentes.
nano .env
```

> ⚠️ **Nunca commite o `.env` com valores reais.** O `.gitignore` já exclui `.env`, `.env.prod` e `.env.local`. Segredos de produção devem ficar em um cofre (ex.: Vaultwarden, Bitwarden, AWS Secrets Manager).

O arquivo `.env.example` está documentado linha a linha. As variáveis obrigatórias para a subida básica em dev são apenas as do banco (default `portal`) — todas as outras podem ficar em branco e as funcionalidades correspondentes ficam desabilitadas.

### 2.2 Subir os serviços

```bash
# Subir todos os containers em background
docker compose up -d

# Acompanhar o startup (aguarde até a API estar healthy)
docker compose logs -f api
# Aguarde a mensagem: "Application is running on: http://[::1]:3001/api"
```

Na primeira execução o Docker vai:

1. Baixar as imagens base (`postgis/postgis:16-3.4`, `redis:7-alpine`, etc.).
2. Construir as imagens `portal-api` e `portal-web` a partir dos Dockerfiles em `./api` e `./web` (multistage, pode levar alguns minutos).
3. Subir o container `db` (Postgres+PostGIS). Ao iniciar pela primeira vez, o Postgres vai executar **automaticamente** todos os arquivos `.sql` presentes em `./db/` (montado em `/docker-entrypoint-initdb.d`), em ordem alfabética. Isso cria o schema, as extensões, os papéis (`portal_app`, `portal_ro`) e todas as 62 migrations.

> ⚠️ A execução automática das migrations (`/docker-entrypoint-initdb.d`) ocorre **somente na primeira inicialização** do volume `pgdata`. Se o volume já existir, o Postgres não reexecuta os scripts. Para forçar uma recriação limpa em dev: `docker compose down -v && docker compose up -d`.

### 2.3 O que cada serviço faz e suas portas

```
┌──────────────────────────────────────────────────────────────────────┐
│  Serviço        │  Imagem                     │  Porta host  │  Uso  │
├──────────────────────────────────────────────────────────────────────┤
│  db             │  postgis/postgis:16-3.4      │  5432        │  Banco principal com PostGIS. Não acessado diretamente pela API — vai via PgBouncer.  │
│  pgbouncer      │  edoburu/pgbouncer:latest    │  6432        │  Pool de conexões (mode=transaction). A API aponta aqui (?pgbouncer=true no DATABASE_URL).  │
│  redis          │  redis:7-alpine              │  6379        │  Filas BullMQ (prefix=portal, DB=1) + cache. Em dev é local; em produção reutiliza o existente.  │
│  n8n            │  n8nio/n8n:latest            │  5678        │  ETL/integrações (importação APLIC TCE-MT, automações). Console: http://localhost:5678  │
│  api            │  build ./api                 │  3001        │  API NestJS. Base: /api. Health: GET /api/health/ready.  │
│  web            │  build ./web                 │  3000        │  Portal Next.js SSR/ISR. Acessa a API pelo hostname interno `api:3001`.  │
└──────────────────────────────────────────────────────────────────────┘
```

**Pontos de acesso em dev:**

| Serviço | URL |
|---------|-----|
| Portal Web | http://localhost:3000 |
| API REST | http://localhost:3001/api |
| Health/Readiness | http://localhost:3001/api/health/ready |
| n8n | http://localhost:5678 |
| Postgres (DBeaver/psql) | localhost:5432 banco `portal` usuário `portal` |
| PgBouncer | localhost:6432 (para testes de pool) |
| Redis | localhost:6379 |

> ⚠️ **Fronteira de camadas (regra inviolável):** o portal Web e o App do Cidadão falam **somente** com a API. Nunca acesse banco, storage, Redis ou APIs externas diretamente do frontend/mobile. Toda lógica fica no backend.

### 2.4 Verificar saúde dos serviços

```bash
# Status geral (coluna STATUS deve mostrar "healthy" para db, redis e api)
docker compose ps

# Smoke test da API
curl -f http://localhost:3001/api/health/ready
# Resposta esperada: {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}

# Verificar logs de um serviço específico
docker compose logs db
docker compose logs api --tail=50
```

Se o `api` demorar para ficar `healthy`, aguarde: o `start_period` do healthcheck é 20 segundos e ele tenta por até 5 tentativas (intervalo 15s). O total máximo de espera é ~95 segundos após o container iniciar.

### 2.5 Migrations manuais (quando necessário)

As migrations rodam automaticamente na primeira subida via `docker-entrypoint-initdb.d`. Se você adicionar um novo arquivo `db/063_nova_feature.sql` e o volume já existir, precisará rodar manualmente:

```bash
# Opção A — via container da API (tem o postgresql16-client instalado)
docker compose exec api bash -c '
  for f in /app/db/*.sql; do
    echo "Applying $f..."
    psql "$DATABASE_URL" -f "$f" 2>&1 | tail -3
  done
'
# Nota: DATABASE_URL aponta para PgBouncer (porta 6432). Para migrations use a
# conexão direta ao postgres (porta 5432) pois algumas migrations usam DDL que
# não é compatível com transaction pooling do PgBouncer:

docker compose exec api bash -c '
  PG_DIRECT="postgresql://portal:portal@db:5432/portal"
  for f in /app/db/*.sql; do
    echo "Applying $f..."
    psql "$PG_DIRECT" -f "$f" 2>&1 | tail -3
  done
'

# Opção B — via container do banco diretamente
docker compose exec db bash -c '
  for f in /docker-entrypoint-initdb.d/*.sql; do
    echo "Applying $f..."
    psql -U portal -d portal -f "$f" 2>&1 | tail -3
  done
'

# Extensão opcional pgvector (embeddings semânticos — habilitar se usar IA RAG camada 4)
docker compose exec db psql -U portal -d portal \
  -f /docker-entrypoint-initdb.d/optional/013_pgvector_embeddings.sql
```

> ⚠️ **Idempotência:** todas as migrations do projeto usam `IF NOT EXISTS` / `CREATE OR REPLACE` / `DO $$ IF NOT EXISTS $$`. Rodar duas vezes a mesma migration não causa erro, mas também não duplica dados. Mesmo assim, mantenha controle de quais já foram aplicadas (ex.: tabela `schema_migrations` ou anotação no runbook).

---

## 3. Produção — Servidor Lidera

### 3.1 Modelo de rede e o que reusar

O Servidor Lidera roda Windows Server 2022 com WSL2/Ubuntu. A rede Docker `evolution-net` já existe e conecta os serviços existentes:

```mermaid
flowchart TB
    subgraph Internet
        U[Cidadão / Browser]
        APP[App do Cidadão]
    end
    U --> CF[Cloudflare Zero Trust]
    APP --> CF
    CF --> NG["Nginx 127.0.0.1:80\n(roteamento por hostname)"]
    NG --> WEB[portal-web :3000]
    NG --> API[portal-api :3001]
    WEB -->|HTTP interno| API

    subgraph evolution-net["Rede Docker: evolution-net (WSL2)"]
        API --> PG["portal-postgres\n(PostGIS — NOVO)"]
        API --> MN["portal-minio\n(storage — NOVO)"]
        API --> REDIS["redis\n(EXISTENTE — DB 1)"]
        API --> EVO["evolution-api\n(EXISTENTE — WhatsApp)"]
        N8N["portal-n8n\n(NOVO)"] --> PG
    end

    API --> GOVBR[gov.br OIDC]
    API --> IA[API Anthropic]
```

**O que o portal reutiliza:**

| Recurso existente | Como usar |
|-------------------|-----------|
| Redis 7 (container `redis`) | BullMQ + cache. Usar DB=1 e prefix `portal:` para não colidir com o Evolution (que usa DB=6). |
| Evolution API (container `evolution-api`) | Notificações WhatsApp via fila `notificacoes`. Nunca pelo frontend. |
| Nginx | Adicionar blocos `server` por hostname. Nunca expor portas diretamente. |
| Cloudflare Zero Trust | Adicionar hostnames públicos no túnel existente. |

**O que o portal provisiona de novo:**

- `portal-postgres` (PostGIS 16 — banco dedicado)
- `portal-minio` (object storage S3-compatível)
- `portal-n8n` (ETL/integrações)
- `portal-api` e `portal-web` (aplicação)

### 3.2 Criar os papéis de banco

> ⚠️ **Regra crítica — RLS:** a API deve conectar **sempre** como `portal_app` (`NOSUPERUSER NOBYPASSRLS`). Um superusuário do PostgreSQL ignora todas as policies de Row Level Security, quebrando o isolamento entre prefeituras (tenants). Nunca coloque o usuário `postgres` na `DATABASE_URL` de produção.

Após subir o container `portal-postgres` pela primeira vez, crie os papéis de aplicação:

```bash
# Entrar no container como superusuário (só para criar os papéis)
docker exec -it portal-postgres psql -U postgres -d portal

-- Papel de aplicação (CRUD, sem privilégios elevados)
CREATE ROLE portal_app LOGIN PASSWORD 'TROQUE_POR_SENHA_FORTE_AQUI'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Papel somente-leitura (relatórios, MCP postgres, BI)
CREATE ROLE portal_ro LOGIN PASSWORD 'TROQUE_POR_OUTRA_SENHA_FORTE'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Permissão de conexão
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;

-- Permissões no schema (após rodar as migrations, execute também:)
GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;

-- Para tabelas criadas no futuro (evita regranting manual)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO portal_ro;

\q
```

Guarde as senhas criadas no cofre de senhas da equipe (Vaultwarden/Bitwarden). Elas vão para o `.env.prod` nos campos `DATABASE_URL` e `DATABASE_URL_READONLY`.

### 3.3 Criar o bucket MinIO e usuário de acesso

Após subir o `portal-minio`:

```bash
# Instalar o cliente mc dentro do container da API (já disponível via imagem)
# ou executar diretamente no container minio:

docker exec -it portal-minio sh

# Configurar alias local
mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# Criar o bucket
mc mb local/portal

# Criar usuário de aplicação (não usar root em produção)
mc admin user add local portal_app_storage SENHA_FORTE_STORAGE

# Criar policy de acesso completo ao bucket portal
cat > /tmp/portal-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": ["arn:aws:s3:::portal", "arn:aws:s3:::portal/*"]
    }
  ]
}
EOF

mc admin policy create local portal-policy /tmp/portal-policy.json
mc admin policy attach local portal-policy --user portal_app_storage

exit
```

Configure então no `.env.prod`:
- `STORAGE_ACCESS_KEY=portal_app_storage`
- `STORAGE_SECRET_KEY=SENHA_FORTE_STORAGE`
- `STORAGE_ROOT_USER` e `STORAGE_ROOT_PASSWORD` só são necessários no `docker-compose.prod.yml` para o container MinIO.

### 3.4 Configurar o arquivo .env.prod

Crie o arquivo em `/home/lidera/portal/.env.prod`. **Nunca o commite no git.**

```bash
# Criar diretório de trabalho
mkdir -p /home/lidera/portal
chmod 700 /home/lidera/portal

# Criar o .env.prod a partir do exemplo
cp /caminho/do/repo/.env.example /home/lidera/portal/.env.prod
chmod 600 /home/lidera/portal/.env.prod

# Editar com os valores reais
nano /home/lidera/portal/.env.prod
```

Referência de variáveis obrigatórias para produção (todas devem ser trocadas do `CHANGE_ME`):

```bash
# ===== Banco =====
# CRITICO: portal_app (NOSUPERUSER NOBYPASSRLS) — nunca o superusuario postgres
DATABASE_URL=postgresql://portal_app:SENHA_FORTE@portal-postgres:5432/portal
DATABASE_URL_READONLY=postgresql://portal_ro:OUTRA_SENHA@portal-postgres:5432/portal

# ===== Redis (reutiliza o existente) =====
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=SENHA_DO_REDIS_EXISTENTE
REDIS_DB=1
REDIS_TLS=false
BULLMQ_PREFIX=portal

# ===== Storage MinIO =====
STORAGE_ENDPOINT=http://portal-minio:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=portal
STORAGE_ACCESS_KEY=portal_app_storage
STORAGE_SECRET_KEY=SENHA_FORTE_STORAGE
STORAGE_FORCE_PATH_STYLE=true

# ===== API =====
PORT=3001
API_URL=http://portal-api:3001
# Domínio público da API (usado para montar URLs de webhook do WhatsApp)
PUBLIC_API=https://api.suaprefeitura.gov.br
# CORS — domínios das prefeituras (ex.: portal.cuiaba.mt.gov.br,portal.barao.mt.gov.br)
ALLOWED_ORIGINS=https://portal.suaprefeitura.gov.br
# Token para proteger /api/metrics (Prometheus). Defina e restrinja por IP no Nginx.
METRICS_TOKEN=GERE_TOKEN_ALEATORIO_AQUI

# ===== Segurança de sessão =====
# Mínimo 32 caracteres. Gere com: openssl rand -base64 48
AUTH_JWT_SECRET=GERE_SEGREDO_FORTE_AQUI_MINIMO_32_CHARS
AUTH_SESSION_TTL=8h
# Pepper HMAC do CPF (LGPD — dedupe sem guardar CPF em claro)
# Gere com: openssl rand -hex 32
CPF_PEPPER=GERE_HEX_64_CHARS_AQUI

# ===== WhatsApp =====
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=CHAVE_DO_EVOLUTION_EXISTENTE
EVOLUTION_INSTANCE=Lidera

# ===== gov.br Login Único =====
GOVBR_CLIENT_ID=
GOVBR_CLIENT_SECRET=
GOVBR_REDIRECT_URI=https://api.suaprefeitura.gov.br/api/auth/govbr/callback
GOVBR_PROVIDER_URL=https://sso.acesso.gov.br
GOVBR_SCOPES=openid email phone profile govbr_confiabilidades

# ===== E-mail =====
SMTP_HOST=smtp.suaprefeitura.gov.br
SMTP_PORT=587
SMTP_USER=noreply@suaprefeitura.gov.br
SMTP_PASS=SENHA_SMTP

# ===== IA =====
ANTHROPIC_API_KEY=sk-ant-...
IA_MODEL=claude-sonnet-4-6
EMBEDDINGS_PROVIDER=voyage
VOYAGE_API_KEY=pa-...
VOYAGE_RERANK_MODEL=rerank-2.5

# ===== Diário Oficial =====
ICP_CERT_PATH=/run/secrets/icp-cert.p12
ICP_CERT_PASSWORD=SENHA_DO_CERT_ICP
DIARIO_SIGNING_KEY=APENAS_PARA_DEV_remover_em_prod_com_ICP_real

# ===== MinIO superusuário (só para o container — não para a aplicação) =====
STORAGE_ROOT_USER=minio_admin
STORAGE_ROOT_PASSWORD=SENHA_ROOT_MINIO_FORTE

# ===== Postgres superusuário (só para o container) =====
POSTGRES_SUPERUSER_PASSWORD=SENHA_SUPER_POSTGRES_FORTE

# ===== n8n =====
N8N_HOST=n8n.suaprefeitura.gov.br
N8N_WEBHOOK_URL=https://n8n.suaprefeitura.gov.br
N8N_DB_USER=postgres
N8N_DB_PASSWORD=SENHA_SUPER_POSTGRES_FORTE
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=SENHA_N8N_ADMIN

# ===== Registry e tag da imagem =====
REGISTRY=seu.registry.io/portal
IMAGE_TAG=v1.0.0
```

> ⚠️ **Cofre de segredos:** em implantações maiores, não armazene segredos nem mesmo no `.env.prod` em disco. Use Docker Secrets, HashiCorp Vault, AWS Secrets Manager ou Azure Key Vault. O `.env.prod` com `chmod 600` é o mínimo aceitável para o Servidor Lidera em estágio inicial.

### 3.5 Subir o stack de produção

```bash
# Copiar o docker-compose.prod.yml para o diretório de trabalho
cp /caminho/do/repo/docker-compose.prod.yml /home/lidera/portal/

cd /home/lidera/portal/

# Verificar que a rede externa existe
docker network ls | grep evolution-net
# Se não existir: docker network create evolution-net

# Subir todos os serviços
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Acompanhar o startup
docker compose -f docker-compose.prod.yml logs -f portal-api
```

### 3.6 Rodar as migrations no banco de produção

Em produção o volume `portal_pg_data` é novo na primeira subida, mas o Postgres **não** tem o diretório `db/` montado em `/docker-entrypoint-initdb.d` (diferente do dev). As migrations devem ser rodadas explicitamente:

```bash
# Copiar o diretório db/ para dentro do container da API
# (a imagem da API não inclui os arquivos .sql — eles só existem em dev montados)
# A forma mais prática é rodar via psql a partir do host WSL2:

cd /caminho/do/repo

# Instalar psql no WSL2 se necessário:
# sudo apt install postgresql-client

export DATABASE_URL_DIRECT="postgresql://postgres:SENHA_SUPER@127.0.0.1:5432/portal"
# Nota: use a porta 5432 exportada pelo container (127.0.0.1:5432).
# Use o superusuário APENAS para as migrations (DDL, criação de roles, RLS policies).
# Após as migrations, a aplicação usa portal_app.

for f in db/*.sql; do
  echo "==> Aplicando $f"
  psql "$DATABASE_URL_DIRECT" -f "$f"
done

# Extensão pgvector (opcional — habilitar se usar embeddings semânticos)
# psql "$DATABASE_URL_DIRECT" -f db/optional/013_pgvector_embeddings.sql

echo "Migrations concluídas."
```

> ⚠️ **Porta do Postgres em produção:** no `docker-compose.prod.yml`, o `portal-postgres` expõe apenas `127.0.0.1:5432:5432` — não fica acessível de fora do servidor. O comando acima funciona dentro do WSL2.

Após as migrations, reaplique os grants ao `portal_app` (as migrations criam tabelas; os grants padrão do `ALTER DEFAULT PRIVILEGES` cobrem isso, mas é bom confirmar):

```bash
docker exec portal-postgres psql -U postgres -d portal -c "
  GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
"
```

---

## 4. Build e publicação das imagens

### 4.1 Build local (teste)

Os Dockerfiles são multistage com `node:20-alpine`. A imagem da API inclui ferramentas extras na etapa runtime: `openssl`, `fontconfig`, `postgresql16-client` (para `pg_dump` nos backups), `tesseract-ocr` + dados em português (OCR de PDFs), e `poppler-utils` (rasterização de páginas PDF).

```bash
# Build da API
docker build -t portal-api:local ./api

# Build do Web (Next.js standalone)
docker build -t portal-web:local ./web

# Testar localmente antes de publicar
docker run --rm -p 3001:3001 \
  --env-file .env \
  portal-api:local
```

### 4.2 Tag e push para um registry

```bash
# Definir variáveis
REGISTRY="seu.registry.io/portal"
TAG="v1.2.0"

# Tag
docker tag portal-api:local  ${REGISTRY}/portal-api:${TAG}
docker tag portal-api:local  ${REGISTRY}/portal-api:latest
docker tag portal-web:local  ${REGISTRY}/portal-web:${TAG}
docker tag portal-web:local  ${REGISTRY}/portal-web:latest

# Login no registry
docker login seu.registry.io

# Push
docker push ${REGISTRY}/portal-api:${TAG}
docker push ${REGISTRY}/portal-api:latest
docker push ${REGISTRY}/portal-web:${TAG}
docker push ${REGISTRY}/portal-web:latest
```

**Nota para GCP Artifact Registry:**

```bash
# Autenticar com gcloud
gcloud auth configure-docker us-central1-docker.pkg.dev

REGISTRY="us-central1-docker.pkg.dev/SEU_PROJETO/portal"
# ... mesmo fluxo de tag e push acima
```

Consulte o manual de deploy em nuvem (`docs/instalacao/04-gcp.md` ou `docs/instalacao/05-aws.md`) para os passos completos de IAM, repositório e deployment.

**Nota para AWS ECR:**

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    123456789.dkr.ecr.us-east-1.amazonaws.com

REGISTRY="123456789.dkr.ecr.us-east-1.amazonaws.com/portal"
# ... mesmo fluxo
```

### 4.3 Builds automatizados (CI/CD)

O pipeline de CI (GitHub Actions, `.github/workflows/`) executa o build, testes e push automaticamente a cada merge na branch `main`. Consulte `docs/05-devops-devsecops.md` para a configuração completa do pipeline.

---

## 5. Operação

### 5.1 Ver logs

```bash
# Dev — todos os serviços
docker compose logs -f

# Dev — serviço específico
docker compose logs -f api --tail=100
docker compose logs -f web
docker compose logs -f db

# Produção
docker compose -f /home/lidera/portal/docker-compose.prod.yml logs -f portal-api
docker compose -f /home/lidera/portal/docker-compose.prod.yml logs -f portal-postgres
```

### 5.2 Backups

O runbook completo está em `docs/operacao/backup-restore-runbook.md`. Resumo:

**Banco (pg_dump):**

```bash
# Usar o postgresql16-client instalado na imagem portal-api para pg_dump
docker exec portal-api pg_dump \
  --dbname="postgresql://portal_app:SENHA@portal-postgres:5432/portal" \
  -Fc \
  --no-acl \
  -f /tmp/portal_backup.dump

docker cp portal-api:/tmp/portal_backup.dump \
  /home/lidera/backups/postgres/portal_$(date +%Y%m%d).dump

# Criptografar com GPG antes de armazenar
gpg --batch --symmetric \
    --passphrase-file /home/lidera/.backup-passphrase \
    --cipher-algo AES256 \
    --output /home/lidera/backups/postgres/portal_$(date +%Y%m%d).dump.gpg \
    /home/lidera/backups/postgres/portal_$(date +%Y%m%d).dump

rm /home/lidera/backups/postgres/portal_$(date +%Y%m%d).dump
```

**MinIO (mc mirror):**

```bash
# mc está disponível no container portal-minio
docker exec portal-minio mc alias set local \
  http://localhost:9000 "$STORAGE_ROOT_USER" "$STORAGE_ROOT_PASSWORD"

docker exec portal-minio mc mirror local/portal \
  /backup/minio/$(date +%Y%m%d) --overwrite
```

**Agendar via cron no WSL2:**

```bash
crontab -e
# Banco às 02:00
0 2 * * * /home/lidera/scripts/backup-portal-pg.sh >> /home/lidera/logs/backup-pg.log 2>&1
# MinIO às 02:30
30 2 * * * /home/lidera/scripts/backup-portal-minio.sh >> /home/lidera/logs/backup-minio.log 2>&1
```

### 5.3 Atualização (nova release)

```bash
cd /home/lidera/portal

# 1. Baixar nova imagem do registry
docker pull ${REGISTRY}/portal-api:v1.3.0
docker pull ${REGISTRY}/portal-web:v1.3.0

# 2. Atualizar a tag no .env.prod
sed -i 's/IMAGE_TAG=.*/IMAGE_TAG=v1.3.0/' .env.prod

# 3. Rodar migrations novas (se houver arquivos novos em db/)
# Veja seção 3.6 para o comando completo
for f in db/063_*.sql db/064_*.sql; do
  psql "$DATABASE_URL_DIRECT" -f "$f"
done

# 4. Recriar os containers com a nova imagem
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d \
  --no-deps --force-recreate portal-api portal-web

# 5. Verificar health
curl -f http://localhost:3001/api/health/ready
docker compose -f docker-compose.prod.yml ps
```

> ⚠️ **Sempre rode as migrations antes de reiniciar a API.** A nova versão do código pode depender de colunas/tabelas que só existem após as migrations. A ordem é: migration → restart API.

### 5.4 Reiniciar um serviço

```bash
# Dev
docker compose restart api
docker compose restart web

# Produção
docker compose -f /home/lidera/portal/docker-compose.prod.yml restart portal-api
```

### 5.5 Escalar workers

Os workers BullMQ rodam na mesma imagem `portal-api`. Para escalar o processamento de filas sem aumentar as conexões HTTP, use `docker compose scale` (ou réplicas no Kubernetes):

```bash
# Dev — escalar para 2 instâncias de API (inclui workers)
docker compose up -d --scale api=2

# Produção com Docker Compose
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  up -d --scale portal-api=3 --no-recreate
```

> Para escala além de 3 réplicas consulte `docs/09-escalabilidade.md` e `docs/adr/ADR-0001-escala-multiregiao.md`. Em escala horizontal o PgBouncer (comentado no `docker-compose.prod.yml`) se torna necessário para controlar o número de conexões ao Postgres.

---

## 6. Reverse proxy: Nginx + Cloudflare

### 6.1 Modelo de exposição

Nenhuma porta da aplicação fica aberta diretamente para a internet. O fluxo é:

```
Cidadão → Cloudflare Zero Trust (cloudflared) → Nginx (127.0.0.1) → containers Docker
```

O Nginx recebe na porta 80 (HTTP interno, TLS terminado no Cloudflare) e roteia por hostname:

```nginx
# /etc/nginx/sites-enabled/portal-web.conf
# Multi-tenant: cada prefeitura tem seu domínio; o Next.js lê o Host header
# e seleciona o tema/conteúdo do tenant correspondente.

server {
    listen 80;
    # Curinga: cobre portal.cuiaba.mt.gov.br, portal.barao.mt.gov.br, etc.
    server_name ~^portal\..*;

    # Segurança mínima (o TLS já foi terminado no Cloudflare)
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Proxy para o portal Web
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy das chamadas de API feitas pelo browser (SSR do Next faz internamente,
    # mas rotas client-side usam /api relativo ao domínio do portal)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Uploads de arquivos (formulários, fotos de chamados)
        client_max_body_size 50M;
    }
}

# Bloco separado para a API pura (domínio api.*)
server {
    listen 80;
    server_name ~^api\..*;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

### 6.2 Cloudflare Zero Trust

No painel Cloudflare (zero trust.cloudflare.com):

1. **Tunnels > Seu túnel > Public Hostnames > Add hostname:**
   - Hostname: `portal.suaprefeitura.gov.br`
   - Service: `http://localhost:80`
   - Repetir para cada prefeitura (ou usar curinga `*.portal.suaprefeitura.gov.br`).

2. **SSL/TLS:** deixar em **Full (strict)** — nunca Flexible.

3. **Proteger `/admin`:** configure Cloudflare Access (Zero Trust > Access > Applications) para exigir autenticação de e-mail e MFA antes de permitir acesso ao painel admin. Consulte `docs/operacao/borda-cloudflare-waf-geo.md` para o detalhamento completo do WAF, geo-bloqueio e rate limiting.

> ⚠️ **Multi-tenant por Host:** o portal identifica o tenant pelo cabeçalho `Host` da requisição. O Nginx **deve** repassar o `Host` original ao container (`proxy_set_header Host $host`). Sem isso todos os requests chegam com o hostname do container e o tenant não é identificado.

---

## 7. Pós-instalação

### 7.1 Smoke test

```bash
# Health da API (Postgres + Redis conectados)
curl -f http://localhost:3001/api/health/ready
# Esperado: {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}

# Verificar que o Web responde
curl -f http://localhost:3000
# Esperado: HTML do portal (pode retornar redirect se não houver tenant configurado)
```

### 7.2 Criar o primeiro tenant e admin

```bash
# Acesse a API interativamente — ajuste o host/porta se estiver em produção
BASE_URL="http://localhost:3001/api"

# 1. Criar o primeiro tenant (prefeitura de exemplo)
curl -s -X POST "$BASE_URL/tenants" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "exemplolandia",
    "nome": "Prefeitura de Exemplolândia",
    "dominio": "portal.exemplolandia.gov.br",
    "cnpj": "00.000.000/0001-00"
  }' | jq .

# 2. Criar o usuário admin do tenant
# (substitua TENANT_ID pelo id retornado acima)
curl -s -X POST "$BASE_URL/usuarios" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Administrador",
    "email": "admin@exemplolandia.gov.br",
    "senha": "TrocarNoPrimeiroAcesso@2026",
    "role": "admin",
    "tenantId": "TENANT_ID_AQUI"
  }' | jq .
```

> ⚠️ **Tenant padrão para testes:** use sempre `exemplolandia`. Não crie tenants descartáveis nem use municípios reais como cobaia (ex.: `barao`) para testes. Consulte a memória `tenant-padrao-testes.md` para o contexto.

### 7.3 Verificar RLS (isolamento entre tenants)

```bash
# Confirmar que portal_app não é superusuário e não bypassa RLS
docker exec portal-postgres psql -U postgres -d portal -c "
  SELECT rolname, rolsuper, rolbypassrls
  FROM pg_roles
  WHERE rolname IN ('portal_app', 'portal_ro');
"
# Esperado: rolsuper=f, rolbypassrls=f para ambos

# Verificar que as policies de RLS estão habilitadas nas tabelas principais
docker exec portal-postgres psql -U portal_app -d portal -c "
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('manifestacoes', 'documentos', 'usuarios', 'noticias')
  ORDER BY tablename;
"
# Esperado: rowsecurity=t para todas
```

---

## 8. Troubleshooting

### 8.1 CRLF em scripts shell (Windows)

Scripts `.sh` com quebras de linha `\r\n` (Windows) falham no Linux/WSL2 com erros como `bash: bad interpreter: No such file or directory`.

```bash
# Converter para LF (Unix)
sed -i 's/\r//' nome-do-script.sh

# Ou com o utilitário dos2unix
sudo apt install dos2unix
dos2unix nome-do-script.sh
```

Configure o Git para não converter ao fazer checkout em Windows:

```bash
git config core.autocrlf false
```

### 8.2 Porta já em uso

```bash
# Identificar o processo usando a porta (ex.: 5432)
ss -tlnp | grep 5432
# ou
sudo lsof -i :5432

# Parar o processo conflitante ou mudar a porta no docker-compose
# No docker-compose, mudar de '5432:5432' para '5433:5432' para evitar conflito
```

### 8.3 PostGIS não encontrado / extensão ausente

A imagem `postgis/postgis:16-3.4` já inclui PostGIS. Se uma migration falhar com `could not open extension control file .../postgis.control`:

```bash
# Verificar se a extensão está disponível na imagem
docker exec portal-postgres psql -U postgres -d portal \
  -c "SELECT name FROM pg_available_extensions WHERE name LIKE 'postgis%';"

# Se a imagem estiver correta mas a extensão ainda não foi criada:
docker exec portal-postgres psql -U postgres -d portal \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec portal-postgres psql -U postgres -d portal \
  -c "CREATE EXTENSION IF NOT EXISTS postgis_topology;"
```

A migration `001_extensions_tenancy_rls.sql` já faz isso automaticamente. Se rodar manualmente, não é necessário repetir.

### 8.4 RLS via superusuário (isolamento quebrado)

Sintoma: usuário de uma prefeitura vê dados de outra, ou queries não filtram por tenant.

Causa mais comum: a `DATABASE_URL` aponta para um papel com `SUPERUSER` ou `BYPASSRLS`.

```bash
# Verificar qual papel a API está usando
docker exec portal-postgres psql -U postgres -d portal -c "
  SELECT usename, application_name, client_addr, state
  FROM pg_stat_activity
  WHERE datname = 'portal';
"

# Se aparecer 'postgres' como usename, a DATABASE_URL está errada.
# Corrigir: trocar portal.env para usar portal_app
```

### 8.5 Healthcheck falhando

O healthcheck da API (`GET /api/health/ready`) retorna 200 somente se **tanto o Postgres quanto o Redis** estiverem acessíveis.

```bash
# Verificar o status do healthcheck
docker inspect portal-api | grep -A5 '"Health"'

# Testar manualmente de dentro do container
docker exec portal-api node -e "
  require('http').get('http://127.0.0.1:3001/api/health/ready', r => {
    console.log('Status:', r.statusCode);
    r.on('data', d => console.log(d.toString()));
  });
"

# Verificar conectividade com o Redis a partir da API
docker exec portal-api sh -c 'nc -zv redis 6379'
# Se falhar: verificar que ambos os containers estão na mesma rede Docker

# Verificar conectividade com o banco
docker exec portal-api sh -c 'nc -zv portal-postgres 5432'
```

### 8.6 Conectar containers em redes diferentes

Em produção, todos os containers do portal devem estar na rede `evolution-net`. Se um container não consegue resolver o hostname de outro:

```bash
# Verificar as redes de um container
docker inspect portal-api | grep -A20 '"Networks"'

# Adicionar um container a uma rede (sem recriar)
docker network connect evolution-net portal-api

# Verificar resolução de hostname
docker exec portal-api sh -c 'nslookup redis'
docker exec portal-api sh -c 'nslookup portal-postgres'
```

### 8.7 Erro de "prepared statement" com PgBouncer

Sintoma: `ERROR: prepared statement "s0" already exists` ou erros similares.

Causa: Prisma usa prepared statements nomeados, incompatíveis com o modo `transaction` do PgBouncer.

Solução: a `DATABASE_URL` deve incluir `?pgbouncer=true` no final:

```
DATABASE_URL=postgresql://portal_app:SENHA@pgbouncer:6432/portal?pgbouncer=true
```

Essa flag instrui o Prisma a desabilitar prepared statements nomeados.

### 8.8 Container da API não sobe (OpenSSL / Prisma)

A imagem da API inclui `openssl` (necessário para o Prisma gerar o query engine). Se a build falhar:

```bash
# Verificar logs de build
docker build --no-cache -t portal-api:debug ./api 2>&1 | tail -30

# Forçar rebuild sem cache
docker compose build --no-cache api
```

---

## 9. Checklist de segurança

Execute antes de considerar a instalação pronta para produção.

```
[ ] DATABASE_URL usa portal_app (NOSUPERUSER NOBYPASSRLS) — nunca 'postgres'
[ ] DATABASE_URL_READONLY usa portal_ro — nunca 'postgres'
[ ] Verificado: rolsuper=f e rolbypassrls=f para portal_app e portal_ro
[ ] RLS habilitado nas tabelas principais (pg_tables.rowsecurity=t)
[ ] AUTH_JWT_SECRET com >= 32 caracteres aleatórios (não é o CHANGE_ME)
[ ] CPF_PEPPER gerado com openssl rand -hex 32 (não é o CHANGE_ME)
[ ] STORAGE_ACCESS_KEY e STORAGE_SECRET_KEY são do usuário de aplicação (não root)
[ ] .env.prod tem chmod 600 e está fora do repositório git
[ ] Segredos reais nunca commitados no git (verificar: git log --all -p | grep -i CHANGE_ME)
[ ] Nenhuma porta de aplicação exposta diretamente para a internet (só 127.0.0.1:*)
[ ] Nginx repassa o cabeçalho Host original (proxy_set_header Host $host)
[ ] Cloudflare SSL/TLS em Full (strict) — nunca Flexible
[ ] Cloudflare Access configurado para /admin com MFA
[ ] WAF rules ativas: geo-bloqueio, rate limit /api, rate limit /auth/login
[ ] METRICS_TOKEN definido e /api/metrics restrito por IP no Nginx/Cloudflare
[ ] Backups configurados e testados (crontab + restore manual validado)
[ ] Redis usando DB=1 e prefix 'portal' (não colide com Evolution no DB=6)
[ ] Smoke test passou: curl -f /api/health/ready retorna {"status":"ok"}
[ ] Primeiro tenant criado com slug e domínio corretos
[ ] Senha do admin inicial trocada no primeiro acesso
[ ] Alertas de segurança configurados no Cloudflare (ver docs/operacao/borda-cloudflare-waf-geo.md)
[ ] Checklist mensal de restore agendado (primeiro sábado de cada mês)
```

---

## Referências cruzadas

| Documento | Conteúdo complementar |
|-----------|----------------------|
| `docs/12-infraestrutura.md` | Mapeamento detalhado do Servidor Lidera, topologia, pegadinhas |
| `docs/04-seguranca.md` | Modelo de ameaças, RLS, RBAC, hardening |
| `docs/07-banco-de-dados.md` | Modelo de dados, índices, PostGIS, detalhes do RLS |
| `docs/operacao/backup-restore-runbook.md` | Scripts completos de backup, restore e checklist mensal |
| `docs/operacao/borda-cloudflare-waf-geo.md` | WAF, geo-bloqueio, Cloudflare Access, alertas |
| `docs/05-devops-devsecops.md` | Pipeline CI/CD, SAST, RLS-check automatizado |
| `docs/09-escalabilidade.md` | Estratégia de escala horizontal, PgBouncer, Kubernetes |
| `docs/adr/ADR-0001-config-por-entidade.md` | Decisão sobre configuração por tenant (IA, WhatsApp, LGPD) |
| `.env.example` | Referência completa de todas as variáveis de ambiente documentadas |
