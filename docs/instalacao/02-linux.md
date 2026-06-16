# Manual de Instalação — Linux (Ubuntu 22.04/24.04 LTS · Debian 12)

> Versão: 2026-06-16  
> Público: operador de infraestrutura Lidera  
> Relacionados: [12 — Infraestrutura](../12-infraestrutura.md) · [04 — Segurança](../04-segurança.md) · [Runbook Backup/Restore](../operacao/backup-restore-runbook.md)

---

## Visão geral

O Portal de Prefeitura é uma plataforma **SaaS multi-tenant**. Um único conjunto de processos serve N prefeituras; o isolamento entre elas é garantido por **Row Level Security (RLS)** no PostgreSQL — não apenas no código. Qualquer falha nesse isolamento é uma violação grave de privacidade pública.

Este manual cobre a instalação em servidor Linux (VM ou bare-metal). Existem **duas abordagens**:

| # | Abordagem | Recomendação |
|---|-----------|--------------|
| 1 | **Docker + docker compose** | **Recomendada** — paridade com produção, menor risco operacional |
| 2 | **Nativa (systemd, sem Docker)** | Alternativa quando Docker é proibido por política da organização |

Comece pela Abordagem 1 exceto se houver restrição explícita.

---

## Componentes e portas

| Serviço | Imagem / Runtime | Porta padrão | Notas |
|---------|-----------------|--------------|-------|
| PostgreSQL + PostGIS | `postgis/postgis:16-3.4` | 5432 | banco `portal`, roles `portal_app` e `portal_ro` |
| PgBouncer | `edoburu/pgbouncer` | 6432 | transaction pooling (opcional, recomendado em prod) |
| Redis | `redis:7-alpine` | 6379 | `REDIS_DB=1`, `BULLMQ_PREFIX=portal` |
| MinIO | `minio/minio` | 9000 (API) / 9001 (console) | bucket `portal` |
| n8n | `n8nio/n8n` | 5678 | ETL/integrações contábeis |
| API (NestJS) | Node 20 / container `api` | 3001 | base `/api`, readiness `GET /api/health/ready` |
| Web (Next.js) | Node 20 / container `web` | 3000 | SSR/ISR multi-tenant |
| ClamAV (opcional) | `clamav/clamav` | 3310 | varredura antivírus de uploads |
| Nginx | apt / nativo | 80 / 443 | reverse proxy; não expor API/Web direto |

> ⚠️ **Nada é aberto diretamente à internet.** Nginx fica entre o mundo e os serviços. Adicione Cloudflare Zero Trust ou outro WAF na borda.

---

## Pré-requisitos

### Hardware mínimo (produção mono-tenant ou multi-tenant pequeno)

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco (SO + app) | 40 GB SSD | 80 GB SSD |
| Disco (dados/volumes) | 50 GB | 200 GB+ (crescimento depende do MinIO) |

### Sistema Operacional suportado

- Ubuntu 22.04 LTS (Jammy) — amd64
- Ubuntu 24.04 LTS (Noble) — amd64
- Debian 12 (Bookworm) — amd64

### Pacotes base (ambas as abordagens)

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y \
  curl \
  wget \
  gnupg2 \
  ca-certificates \
  lsb-release \
  apt-transport-https \
  software-properties-common \
  build-essential \
  git \
  openssl \
  unzip \
  ufw \
  fail2ban \
  logrotate \
  postgresql-client \
  tesseract-ocr \
  tesseract-ocr-por \
  poppler-utils
```

> Os pacotes `tesseract-ocr`, `tesseract-ocr-por` e `poppler-utils` são necessários no host para a **Abordagem 2 (nativa)**. Na Abordagem 1 (Docker) já estão incluídos no `api/Dockerfile`.

### Firewall básico antes de começar

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# Confirme com 'y'
```

---

## Abordagem 1 — Recomendada: Docker + docker compose

### Por que Docker?

Garante paridade exata com o ambiente de desenvolvimento e CI/CD. As migrations SQL rodam automaticamente na primeira subida do container `db`. O `restart: always` mantém os serviços vivos após reinicializações do host.

### Passo 1 — Instalar o Docker Engine

```bash
# Remover versões antigas (se existirem)
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Adicionar repositório oficial Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Para Debian 12, substitua 'ubuntu' por 'debian' na linha abaixo
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

# Verificar
docker --version
docker compose version
```

Adicionar o usuário corrente ao grupo `docker` para não exigir `sudo` a cada comando:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Habilitar o serviço para iniciar com o sistema:

```bash
sudo systemctl enable docker
sudo systemctl enable containerd
sudo systemctl start docker
```

### Passo 2 — Clonar o repositório

```bash
sudo mkdir -p /opt/portal-prefeitura
sudo chown $USER:$USER /opt/portal-prefeitura

git clone https://github.com/<sua-org>/portal-prefeitura.git /opt/portal-prefeitura
cd /opt/portal-prefeitura
```

> Substitua a URL pelo endereço real do repositório (GitHub, GitLab ou servidor Git interno).

### Passo 3 — Configurar variáveis de ambiente

```bash
cd /opt/portal-prefeitura
cp .env.example .env
chmod 600 .env
```

Edite o arquivo `.env` com um editor de texto:

```bash
nano .env
# ou: vim .env
```

#### Segredos obrigatórios — gere os valores antes de preenchê-los

```bash
# Gerar AUTH_JWT_SECRET (>=32 bytes, hexadecimal)
openssl rand -hex 32
# Gerar CPF_PEPPER (>=32 bytes, hexadecimal — proteção LGPD do CPF)
openssl rand -hex 32
# Gerar senha forte para portal_app
openssl rand -base64 32
# Gerar senha forte para portal_ro
openssl rand -base64 32
# Gerar credencial do MinIO
openssl rand -base64 24
openssl rand -base64 24
```

#### Variáveis mínimas para primeira subida

Preencha no `.env` (substitua os placeholders pelo resultado dos comandos acima):

```ini
# ============================================================
# Banco (porta 5432 interna; PgBouncer em 6432)
# ============================================================
DATABASE_URL=postgresql://portal_app:<senha-portal-app>@db:5432/portal
DATABASE_URL_READONLY=postgresql://portal_ro:<senha-portal-ro>@db:5432/portal

# ============================================================
# Redis
# ============================================================
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<defina-forte>
REDIS_DB=1
REDIS_TLS=false
BULLMQ_PREFIX=portal

# ============================================================
# Object Storage (MinIO)
# ============================================================
STORAGE_ENDPOINT=http://portal-minio:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=portal
STORAGE_ACCESS_KEY=<minio-access-key>
STORAGE_SECRET_KEY=<minio-secret-key>
STORAGE_FORCE_PATH_STYLE=true

# ============================================================
# API / Web
# ============================================================
PORT=3001
API_URL=http://api:3001
ALLOWED_ORIGINS=https://portal.<sua-prefeitura>.gov.br,https://admin.<sua-prefeitura>.gov.br
METRICS_TOKEN=<token-prometheus-defina-forte>

# ============================================================
# Sessão e segurança (gere com openssl rand -hex 32)
# ============================================================
AUTH_JWT_SECRET=<resultado-openssl-rand-hex-32>
AUTH_SESSION_TTL=8h
CPF_PEPPER=<resultado-openssl-rand-hex-32>

# ============================================================
# WhatsApp (escolha o provider; configure por tenant no admin)
# ============================================================
WHATSAPP_PROVIDER=evolution
WHATSAPP_FALLBACK_PROVIDER=evolution
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=<chave-evolution>
EVOLUTION_INSTANCE=Portal

# ============================================================
# gov.br Login Único (OIDC — preencher após cadastro no SOUGOV)
# ============================================================
GOVBR_CLIENT_ID=
GOVBR_CLIENT_SECRET=
GOVBR_REDIRECT_URI=https://<dominio>/api/auth/govbr/callback
GOVBR_PROVIDER_URL=https://sso.staging.acesso.gov.br
GOVBR_SCOPES=openid email phone profile govbr_confiabilidades

# ============================================================
# E-mail SMTP
# ============================================================
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-pass>

# ============================================================
# IA (Anthropic + embeddings opcionais)
# ============================================================
ANTHROPIC_API_KEY=<chave-anthropic>
IA_MODEL=
EMBEDDINGS_PROVIDER=
VOYAGE_API_KEY=
OPENAI_API_KEY=

# ============================================================
# Diário Oficial (assinatura ICP-Brasil — deixar vazio em homolog)
# ============================================================
ICP_CERT_PATH=
ICP_CERT_PASSWORD=
DIARIO_SIGNING_KEY=<somente-em-dev-nao-usar-em-prod>
```

> ⚠️ **Nunca versione o `.env` com valores reais.** Use um cofre de segredos (HashiCorp Vault, Bitwarden Secrets, AWS Secrets Manager, ou pelo menos variáveis de ambiente injetadas pelo CI/CD).

### Passo 4 — Ajustar o docker-compose.yml para produção

O `docker-compose.yml` raiz é orientado a desenvolvimento. Para produção no Linux, crie um override:

```bash
cat > /opt/portal-prefeitura/docker-compose.prod.yml << 'EOF'
services:
  db:
    image: postgis/postgis:16-3.4
    restart: always
    environment:
      POSTGRES_DB: portal
      POSTGRES_USER: portal_app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - portal_pg_data:/var/lib/postgresql/data
      - ./db:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U portal_app -d portal']
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - portal_net

  pgbouncer:
    image: edoburu/pgbouncer:latest
    restart: always
    environment:
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: portal_app
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: portal
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 20
      AUTH_TYPE: scram-sha-256
    depends_on:
      db:
        condition: service_healthy
    networks:
      - portal_net

  redis:
    image: redis:7-alpine
    restart: always
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --databases 16
    volumes:
      - portal_redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - portal_net

  portal-minio:
    image: minio/minio:latest
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY}
    volumes:
      - portal_minio_data:/data
    networks:
      - portal_net

  n8n:
    image: n8nio/n8n:latest
    restart: always
    environment:
      N8N_HOST: localhost
      N8N_PORT: 5678
      N8N_PROTOCOL: http
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: db
      DB_POSTGRESDB_DATABASE: portal
      DB_POSTGRESDB_USER: portal_app
      DB_POSTGRESDB_PASSWORD: ${DB_PASSWORD}
    volumes:
      - portal_n8n_data:/home/node/.n8n
    depends_on:
      db:
        condition: service_healthy
    networks:
      - portal_net

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    restart: always
    env_file: .env
    environment:
      DATABASE_URL: postgresql://portal_app:${DB_PASSWORD}@pgbouncer:6432/portal?pgbouncer=true
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      REDIS_DB: "1"
      PORT: "3001"
    ports:
      - '127.0.0.1:3001:3001'
    depends_on:
      pgbouncer:
        condition: service_started
      redis:
        condition: service_healthy
    healthcheck:
      test:
        - CMD-SHELL
        - >
          node -e "require('http').get('http://127.0.0.1:3001/api/health/ready',
          r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
      interval: 20s
      timeout: 10s
      retries: 5
      start_period: 30s
    networks:
      - portal_net

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    restart: always
    env_file: .env
    environment:
      API_URL: http://api:3001
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      api:
        condition: service_healthy
    networks:
      - portal_net

volumes:
  portal_pg_data:
  portal_redis_data:
  portal_minio_data:
  portal_n8n_data:

networks:
  portal_net:
    driver: bridge
EOF
```

> Observe que `ports` liga apenas em `127.0.0.1` — os serviços ficam escutando apenas localmente; o Nginx faz o proxy para o mundo externo.

### Passo 5 — Configurar variáveis adicionais do compose de produção

Exporte `DB_PASSWORD` e `REDIS_PASSWORD` no `.env` (ou como variáveis de shell) para o compose de produção. A forma mais limpa é incluí-las no mesmo `.env`:

```bash
# Adicionar ao final do .env (se ainda não estiver lá)
echo "DB_PASSWORD=$(openssl rand -base64 32)" >> .env
```

### Passo 6 — Construir as imagens e subir os serviços

```bash
cd /opt/portal-prefeitura

# Build das imagens (pode levar alguns minutos na primeira vez)
docker compose -f docker-compose.prod.yml build --no-cache

# Subir todos os serviços em background
docker compose -f docker-compose.prod.yml up -d

# Acompanhar os logs (Ctrl+C para sair)
docker compose -f docker-compose.prod.yml logs -f
```

Na **primeira subida**, o container `db` executa automaticamente todas as 62 migrations de `db/*.sql` em ordem alfabética (montadas em `/docker-entrypoint-initdb.d`). Aguarde o banco ficar saudável antes de verificar a API.

### Passo 7 — Verificar a saúde dos serviços

```bash
# Status de todos os containers
docker compose -f docker-compose.prod.yml ps

# Healthcheck da API (deve retornar HTTP 200 com JSON)
curl -f http://127.0.0.1:3001/api/health/ready
# Resposta esperada: {"status":"ok","details":{...}}

# Verificar banco de dados — listar tabelas criadas pelas migrations
docker exec $(docker compose -f docker-compose.prod.yml ps -q db) \
  psql -U portal_app -d portal -c "\dt" | head -30

# Verificar PostGIS
docker exec $(docker compose -f docker-compose.prod.yml ps -q db) \
  psql -U portal_app -d portal -c "SELECT PostGIS_Version();"
```

### Passo 8 — Criar roles do banco com RLS correto

> ⚠️ **CRÍTICO:** O container `db` cria o usuário `portal_app` (definido em `POSTGRES_USER`), mas você precisa criar também o `portal_ro` e garantir que ambos têm `NOSUPERUSER NOBYPASSRLS`. Superusuários ignoram RLS, quebrando o isolamento entre prefeituras.

```bash
# Conectar ao banco como superusuário temporariamente (só para criar roles)
docker exec -it $(docker compose -f docker-compose.prod.yml ps -q db) \
  psql -U postgres -d portal

# Dentro do psql:
```

```sql
-- Verificar que portal_app não é superusuário
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('portal_app', 'portal_ro');

-- Criar portal_ro (somente leitura — MCP, relatórios, auditorias)
CREATE ROLE portal_ro LOGIN
  PASSWORD '<senha-portal-ro-forte>'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

-- Garantir que portal_app também não tem bypass (deve ser NOBYPASSRLS por padrão)
ALTER ROLE portal_app NOSUPERUSER NOBYPASSRLS;

-- Conceder acesso ao banco
GRANT CONNECT ON DATABASE portal TO portal_ro;
GRANT USAGE ON SCHEMA public TO portal_ro;

-- portal_ro: somente SELECT em todas as tabelas
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_ro;

-- Aplicar permissões a tabelas futuras automaticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO portal_ro;

-- portal_app: CRUD completo (as policies de RLS restringem o escopo)
GRANT USAGE ON SCHEMA public TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portal_app;

\q
```

Após criar `portal_ro`, atualize o `.env`:

```ini
DATABASE_URL_READONLY=postgresql://portal_ro:<senha-portal-ro-forte>@db:5432/portal
```

E reinicie a API:

```bash
docker compose -f docker-compose.prod.yml restart api
```

### Passo 9 — Criar bucket no MinIO

```bash
# Instalar o cliente mc (MinIO Client) localmente para gerenciar o MinIO
wget https://dl.min.io/client/mc/release/linux-amd64/mc -O /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configurar alias
source /opt/portal-prefeitura/.env
mc alias set portal-local http://127.0.0.1:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"

# Criar o bucket
mc mb portal-local/portal

# Verificar
mc ls portal-local
```

### Passo 10 — Systemd unit para gerenciar o compose como serviço

Crie uma unit systemd para que o Docker Compose suba automaticamente com o sistema (independente do usuário estar logado):

```bash
sudo tee /etc/systemd/system/portal-prefeitura.service > /dev/null << 'EOF'
[Unit]
Description=Portal de Prefeitura (docker compose)
Documentation=https://github.com/<sua-org>/portal-prefeitura
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/portal-prefeitura
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.prod.yml pull && \
           /usr/bin/docker compose -f docker-compose.prod.yml up -d --remove-orphans
StandardOutput=journal
StandardError=journal
Restart=no
TimeoutStartSec=180
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable portal-prefeitura.service
sudo systemctl start portal-prefeitura.service

# Verificar status
sudo systemctl status portal-prefeitura.service
```

---

## Abordagem 2 — Nativa (systemd, sem Docker)

Use esta abordagem apenas quando Docker não estiver disponível ou for vedado por política. Requer mais passos e atenção a dependências do sistema.

### Passo 1 — Node.js 20 LTS via NodeSource

```bash
# Adicionar repositório NodeSource (Node 20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar
node --version    # deve ser v20.x.x
npm --version
```

Alternativamente via nvm (permite múltiplas versões):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node --version
```

### Passo 2 — PostgreSQL 16 + PostGIS

```bash
# Repositório oficial do PostgreSQL
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y

sudo apt install -y \
  postgresql-16 \
  postgresql-16-postgis-3 \
  postgresql-16-postgis-3-scripts \
  postgresql-client-16

# Habilitar e iniciar
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

#### Criar banco, extensão e roles

```bash
sudo -u postgres psql << 'SQL'
-- Banco do portal
CREATE DATABASE portal;

-- Conectar ao portal para criar a extensão
\c portal

-- PostGIS (obrigatório para chamados georreferenciados)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role da aplicação: NOSUPERUSER NOBYPASSRLS (crítico para RLS funcionar)
CREATE ROLE portal_app LOGIN
  PASSWORD '<senha-portal-app-forte>'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

-- Role somente-leitura (MCP, relatórios, auditorias)
CREATE ROLE portal_ro LOGIN
  PASSWORD '<senha-portal-ro-forte>'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

-- Permissões
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_ro;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO portal_ro;

SQL
```

#### Rodar as 62 migrations em ordem

```bash
export DATABASE_URL="postgresql://portal_app:<senha-portal-app-forte>@localhost:5432/portal"

cd /opt/portal-prefeitura

for f in $(ls db/*.sql | sort); do
  echo "==> Aplicando: $f"
  psql "$DATABASE_URL" -f "$f"
  if [ $? -ne 0 ]; then
    echo "ERRO na migration: $f — abortando."
    exit 1
  fi
done

echo "Todas as 62 migrations aplicadas com sucesso."
```

Para habilitar busca semântica com pgvector (opcional):

```bash
# Instalar a extensão pgvector no servidor primeiro
sudo apt install -y postgresql-16-pgvector

# Depois aplicar a migration opcional
psql "$DATABASE_URL" -f db/optional/013_pgvector_embeddings.sql
```

### Passo 3 — Redis 7

```bash
# Repositório oficial do Redis
curl -fsSL https://packages.redis.io/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] \
  https://packages.redis.io/deb $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/redis.list

sudo apt update
sudo apt install -y redis-server redis-tools

# Configurar senha e banco dedicado
sudo tee -a /etc/redis/redis.conf > /dev/null << 'EOF'
requirepass <senha-redis-forte>
databases 16
appendonly yes
EOF

sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Verificar
redis-cli -a '<senha-redis-forte>' ping
# Resposta: PONG
```

### Passo 4 — MinIO (binário + systemd)

```bash
# Criar usuário dedicado (sem shell, sem login)
sudo useradd -r -s /sbin/nologin -M minio-user

# Criar diretórios
sudo mkdir -p /opt/minio /srv/minio/data
sudo chown minio-user:minio-user /opt/minio /srv/minio/data

# Baixar binário
sudo wget https://dl.min.io/server/minio/release/linux-amd64/minio \
  -O /usr/local/bin/minio
sudo chmod +x /usr/local/bin/minio

# Arquivo de configuração
sudo tee /etc/default/minio > /dev/null << 'EOF'
MINIO_ROOT_USER=<minio-access-key>
MINIO_ROOT_PASSWORD=<minio-secret-key>
MINIO_VOLUMES="/srv/minio/data"
MINIO_OPTS="--console-address :9001"
EOF
sudo chmod 600 /etc/default/minio

# Unit systemd
sudo tee /etc/systemd/system/minio.service > /dev/null << 'EOF'
[Unit]
Description=MinIO Object Storage
Documentation=https://min.io/docs/
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/minio
EnvironmentFile=/etc/default/minio
User=minio-user
Group=minio-user
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES $MINIO_OPTS
Restart=always
RestartSec=5
LimitNOFILE=65536
TimeoutStopSec=60
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable minio
sudo systemctl start minio
sudo systemctl status minio

# Criar bucket via mc
source /opt/portal-prefeitura/.env
mc alias set portal-local http://127.0.0.1:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"
mc mb portal-local/portal
```

### Passo 5 — Build da API (NestJS)

```bash
cd /opt/portal-prefeitura/api

# Instalar dependências
npm ci

# Gerar o Prisma Client (necessário após qualquer mudança no schema)
npm run prisma:generate

# Build de produção
npm run build

# Remover dependências de desenvolvimento
npm prune --omit=dev
```

#### Unit systemd para a API

```bash
# Criar usuário dedicado (sem shell de login)
sudo useradd -r -s /sbin/nologin -M portal-api

# Copiar aplicação buildada para /opt/portal-api
sudo cp -r /opt/portal-prefeitura/api /opt/portal-api
sudo chown -R portal-api:portal-api /opt/portal-api

sudo tee /etc/systemd/system/portal-api.service > /dev/null << 'EOF'
[Unit]
Description=Portal Prefeitura — API (NestJS)
Documentation=https://github.com/<sua-org>/portal-prefeitura
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=portal-api
Group=portal-api
WorkingDirectory=/opt/portal-api
EnvironmentFile=/opt/portal-prefeitura/.env

# Sobrescrever as URLs para apontar para localhost (não para hostnames Docker)
Environment=DATABASE_URL=postgresql://portal_app:<senha>@localhost:5432/portal
Environment=REDIS_HOST=127.0.0.1
Environment=REDIS_PORT=6379
Environment=STORAGE_ENDPOINT=http://127.0.0.1:9000
Environment=PORT=3001
Environment=NODE_ENV=production

ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=portal-api

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/portal-api
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable portal-api
sudo systemctl start portal-api
sudo systemctl status portal-api
```

### Passo 6 — Build do Web (Next.js)

```bash
cd /opt/portal-prefeitura/web

npm ci
npm run build
```

O Next.js deve estar configurado com `output: 'standalone'` no `next.config.mjs` (já definido no projeto). O resultado fica em `.next/standalone/`.

```bash
# Copiar saída standalone para /opt/portal-web
sudo cp -r /opt/portal-prefeitura/web/.next/standalone /opt/portal-web
sudo cp -r /opt/portal-prefeitura/web/.next/static /opt/portal-web/.next/static
sudo cp -r /opt/portal-prefeitura/web/public /opt/portal-web/public
sudo mkdir -p /opt/portal-web/.next/cache
sudo useradd -r -s /sbin/nologin -M portal-web
sudo chown -R portal-web:portal-web /opt/portal-web
```

#### Unit systemd para o Web

```bash
sudo tee /etc/systemd/system/portal-web.service > /dev/null << 'EOF'
[Unit]
Description=Portal Prefeitura — Web (Next.js)
Documentation=https://github.com/<sua-org>/portal-prefeitura
After=network-online.target portal-api.service
Wants=network-online.target
Requires=portal-api.service

[Service]
Type=simple
User=portal-web
Group=portal-web
WorkingDirectory=/opt/portal-web
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=API_URL=http://127.0.0.1:3001

ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=portal-web

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/portal-web/.next/cache
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable portal-web
sudo systemctl start portal-web
sudo systemctl status portal-web
```

### Passo 7 (opcional) — n8n para ETL

```bash
npm install -g n8n

sudo useradd -r -s /sbin/nologin -m -d /opt/n8n n8n-user

sudo tee /etc/systemd/system/n8n.service > /dev/null << 'EOF'
[Unit]
Description=n8n Workflow Automation
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=n8n-user
Group=n8n-user
WorkingDirectory=/opt/n8n
Environment=N8N_HOST=127.0.0.1
Environment=N8N_PORT=5678
Environment=N8N_PROTOCOL=http
Environment=DB_TYPE=postgresdb
Environment=DB_POSTGRESDB_HOST=localhost
Environment=DB_POSTGRESDB_DATABASE=portal
Environment=DB_POSTGRESDB_USER=portal_app
Environment=DB_POSTGRESDB_PASSWORD=<senha-portal-app>
Environment=N8N_USER_FOLDER=/opt/n8n

ExecStart=/usr/bin/n8n start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=n8n

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable n8n
sudo systemctl start n8n
```

---

## Reverse Proxy com Nginx e TLS

Esta seção se aplica às **duas abordagens**. O Nginx é o único ponto de entrada HTTP/HTTPS do servidor.

### Instalar Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Estrutura de configuração multi-tenant

O portal é multi-tenant por `Host`. O Nginx repassa o cabeçalho `X-Forwarded-Host` para que a API e o Web resolvam o tenant correto.

Crie o arquivo de configuração base:

```bash
sudo tee /etc/nginx/sites-available/portal-prefeitura.conf > /dev/null << 'NGINX'
# ============================================================
# Portal de Prefeitura — configuração multi-tenant
# Cada prefeitura tem seu próprio hostname; o Nginx repassa
# o Host original via X-Forwarded-Host para que o backend
# resolva o tenant correto.
# ============================================================

# Upstream da API (NestJS :3001)
upstream portal_api {
    server 127.0.0.1:3001;
    keepalive 32;
}

# Upstream do Web (Next.js :3000)
upstream portal_web {
    server 127.0.0.1:3000;
    keepalive 32;
}

# ============================================================
# Vhost curinga — captura QUALQUER hostname (multi-tenant)
# Em produção, adicione server_name explícitos para cada
# prefeitura/domínio. O vhost curinga serve como catch-all
# enquanto não há certificado wildcard.
# ============================================================
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # ACME challenge (Let's Encrypt / certbot)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirecionar HTTP → HTTPS (descomente após instalar certificado)
    # return 301 https://$host$request_uri;

    # Enquanto não tiver TLS, servir diretamente:
    include /etc/nginx/snippets/portal-proxy.conf;
}

# ============================================================
# Vhost HTTPS (descomente e ajuste após instalar certificado)
# Repita este bloco para cada domínio de prefeitura OU use
# um certificado wildcard (*.sua-prefeitura.gov.br).
# ============================================================
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name portal.sua-prefeitura.gov.br
#                 admin.sua-prefeitura.gov.br;
#
#     ssl_certificate     /etc/letsencrypt/live/portal.sua-prefeitura.gov.br/fullchain.pem;
#     ssl_certificate_key /etc/letsencrypt/live/portal.sua-prefeitura.gov.br/privkey.pem;
#     ssl_trusted_certificate /etc/letsencrypt/live/portal.sua-prefeitura.gov.br/chain.pem;
#
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
#     ssl_prefer_server_ciphers off;
#     ssl_session_timeout 1d;
#     ssl_session_cache shared:MozSSL:10m;
#     ssl_stapling on;
#     ssl_stapling_verify on;
#     resolver 1.1.1.1 8.8.8.8 valid=300s;
#     resolver_timeout 5s;
#
#     add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
#
#     include /etc/nginx/snippets/portal-proxy.conf;
# }
NGINX

# Snippet de proxy compartilhado
sudo mkdir -p /etc/nginx/snippets
sudo tee /etc/nginx/snippets/portal-proxy.conf > /dev/null << 'SNIPPET'
# ============================================================
# Headers de segurança
# ============================================================
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# CSP configurado aqui é básico; a API e o Next.js podem sobrescrever por tenant.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://www.vlibras.gov.br;" always;

# ============================================================
# Rota /api/* → API (NestJS :3001)
# ============================================================
location /api/ {
    proxy_pass http://portal_api;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    # Multi-tenant: repassa o hostname original
    proxy_set_header Host               $host;
    proxy_set_header X-Forwarded-Host   $host;
    proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Real-IP          $remote_addr;

    # Timeouts generosos para uploads e OCR
    proxy_connect_timeout 30s;
    proxy_send_timeout    120s;
    proxy_read_timeout    120s;

    # Uploads: aumentar limite (foto de chamado, PDF do Diário)
    client_max_body_size 50M;
}

# ============================================================
# Rota / e /* → Web (Next.js :3000)
# ============================================================
location / {
    proxy_pass http://portal_web;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host               $host;
    proxy_set_header X-Forwarded-Host   $host;
    proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Real-IP          $remote_addr;

    # Cache de assets estáticos do Next.js
    location ~* \.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico|webp)$ {
        proxy_pass http://portal_web;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
    }

    proxy_connect_timeout 10s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;
    client_max_body_size  10M;
}
SNIPPET

# Ativar site e recarregar Nginx
sudo ln -sf /etc/nginx/sites-available/portal-prefeitura.conf \
            /etc/nginx/sites-enabled/portal-prefeitura.conf

# Desativar site default se existir
sudo rm -f /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Recarregar (sem downtime)
sudo systemctl reload nginx
```

### TLS com Let's Encrypt (certbot)

```bash
# Instalar certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado (substitua o domínio e e-mail)
sudo certbot --nginx \
  -d portal.sua-prefeitura.gov.br \
  -d admin.sua-prefeitura.gov.br \
  --non-interactive \
  --agree-tos \
  -m infra@sua-prefeitura.gov.br

# Verificar renovação automática
sudo certbot renew --dry-run

# O certbot já configura um cron/timer para renovação automática
sudo systemctl status snap.certbot.renew.timer 2>/dev/null || \
  sudo systemctl status certbot.timer 2>/dev/null
```

Após obter o certificado, edite `/etc/nginx/sites-available/portal-prefeitura.conf` e descomente o bloco HTTPS, depois remova a servência HTTP direta (deixando apenas o redirect 301).

### TLS via Cloudflare (alternativa)

Se o servidor estiver atrás do Cloudflare (Zero Trust ou proxy padrão), o TLS termina no edge da Cloudflare. Neste caso:

1. Configure o Nginx para servir apenas em HTTP (porta 80) no localhost — o Cloudflare cuida do HTTPS externo.
2. Habilite o modo "Full (strict)" no SSL/TLS do Cloudflare e instale um certificado de origem Cloudflare no Nginx.
3. O Nginx recebe o cabeçalho `CF-Connecting-IP` — adicione `set_real_ip_from 173.245.48.0/20;` (ranges da Cloudflare) e `real_ip_header CF-Connecting-IP;` no bloco `http {}` do Nginx.

Detalhes em [docs/operacao/borda-cloudflare-waf-geo.md](../operacao/borda-cloudflare-waf-geo.md).

---

## Pós-instalação: primeiro tenant e smoke tests

### Criar o primeiro tenant e admin

Após a API estar respondendo em `http://127.0.0.1:3001/api/health/ready`, use a API de plataforma para criar o tenant inicial:

```bash
# Criar tenant (ajuste o JSON para sua prefeitura)
curl -s -X POST http://127.0.0.1:3001/api/platform/tenants \
  -H "Content-Type: application/json" \
  -H "X-Platform-Token: <METRICS_TOKEN>" \
  -d '{
    "name": "Prefeitura de Exemplo",
    "slug": "exemplolandia",
    "domain": "portal.sua-prefeitura.gov.br",
    "primaryColor": "#0066CC",
    "secondaryColor": "#FFD700"
  }' | jq .
```

```bash
# Criar admin da prefeitura
curl -s -X POST http://127.0.0.1:3001/api/platform/tenants/<tenant-id>/admin \
  -H "Content-Type: application/json" \
  -H "X-Platform-Token: <METRICS_TOKEN>" \
  -d '{
    "name": "Administrador",
    "email": "admin@sua-prefeitura.gov.br",
    "password": "<senha-admin-forte>",
    "role": "admin_prefeitura"
  }' | jq .
```

> Os endpoints exatos dependem do módulo de plataforma implementado. Confirme em `api/src/modules/platform/` se a rota existe; caso contrário, crie via psql direto com `INSERT INTO tenants (...)`.

### Smoke tests

```bash
# 1. Healthcheck da API
curl -f http://127.0.0.1:3001/api/health/ready
echo "API: OK"

# 2. Portal web respondendo
curl -f -o /dev/null -s -w "%{http_code}" http://127.0.0.1:3000/
echo " Web: OK"

# 3. MinIO respondendo
curl -f http://127.0.0.1:9000/minio/health/live
echo "MinIO: OK"

# 4. Verificar RLS — nenhuma consulta sem tenant_id deve vazar dados
# (teste automatizado está em api/test/rls/)
```

---

## Operação

### Visualizar logs

**Abordagem 1 (Docker):**

```bash
# Todos os serviços
docker compose -f /opt/portal-prefeitura/docker-compose.prod.yml logs -f

# Apenas a API
docker compose -f /opt/portal-prefeitura/docker-compose.prod.yml logs -f api

# Apenas o Web
docker compose -f /opt/portal-prefeitura/docker-compose.prod.yml logs -f web
```

**Abordagem 2 (nativa):**

```bash
# API
sudo journalctl -u portal-api -f

# Web
sudo journalctl -u portal-web -f

# MinIO
sudo journalctl -u minio -f

# Últimas 100 linhas de um serviço
sudo journalctl -u portal-api -n 100 --no-pager
```

### Rotação de logs

Configure a rotação de logs do journald editando `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=2G
MaxFileSec=7day
MaxRetentionSec=1month
```

```bash
sudo systemctl restart systemd-journald
```

Para logs do Nginx, o `logrotate` já está configurado por padrão em `/etc/logrotate.d/nginx`. Verifique a retenção:

```bash
cat /etc/logrotate.d/nginx
```

### Backup do banco de dados

```bash
# Backup manual (Abordagem 1 — via container)
DATE=$(date +%Y%m%d_%H%M%S)
docker exec portal-postgres pg_dump \
  -U portal_app \
  -d portal \
  -Fc \
  -f /tmp/portal_backup.dump

docker cp portal-postgres:/tmp/portal_backup.dump \
  /opt/backups/postgres/portal_${DATE}.dump

# Criptografar
gpg --symmetric --cipher-algo AES256 \
    --output /opt/backups/postgres/portal_${DATE}.dump.gpg \
    /opt/backups/postgres/portal_${DATE}.dump
rm /opt/backups/postgres/portal_${DATE}.dump
```

**Backup manual (Abordagem 2 — nativa):**

```bash
DATE=$(date +%Y%m%d_%H%M%S)
export PGPASSWORD='<senha-portal-app>'
pg_dump -U portal_app -h localhost -d portal -Fc \
  -f /opt/backups/postgres/portal_${DATE}.dump
unset PGPASSWORD
```

Para o runbook completo com schedule e restore, consulte [docs/operacao/backup-restore-runbook.md](../operacao/backup-restore-runbook.md).

### Backup do MinIO (storage de objetos)

```bash
source /opt/portal-prefeitura/.env
mc alias set portal-local http://127.0.0.1:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"

# Mirror para destino local ou externo
mc mirror portal-local/portal /opt/backups/minio/$(date +%Y%m%d)/ \
  --overwrite
```

### Atualizar para nova versão

```bash
cd /opt/portal-prefeitura

# 1. Buscar atualizações
git pull origin main

# 2. Verificar se há novas migrations
ls db/*.sql | wc -l
# (compare com a última versão instalada; migrations novas têm número maior)

# 3. Abordagem 1 (Docker) — rebuild e restart
docker compose -f docker-compose.prod.yml build --no-cache api web
docker compose -f docker-compose.prod.yml up -d api web
# As novas migrations NÃO rodam automaticamente em updates (só na primeira subida).
# Aplique-as manualmente:
LAST_APPLIED=062  # ajuste para o número da última migration já aplicada
for f in $(ls db/*.sql | sort | grep -E "0[6-9][3-9]_|0[7-9][0-9]_" 2>/dev/null); do
  echo "==> Aplicando: $f"
  docker exec -i portal-postgres psql -U portal_app -d portal < "$f"
done

# 4. Abordagem 2 (nativa) — rebuild e restart
cd api && npm ci && npm run prisma:generate && npm run build && npm prune --omit=dev
sudo cp -r dist /opt/portal-api/dist
sudo systemctl restart portal-api

cd ../web && npm ci && npm run build
sudo cp -r .next/standalone /opt/portal-web-new
sudo cp -r .next/static /opt/portal-web-new/.next/static
sudo cp -r public /opt/portal-web-new/public
sudo chown -R portal-web:portal-web /opt/portal-web-new
sudo mv /opt/portal-web /opt/portal-web-old
sudo mv /opt/portal-web-new /opt/portal-web
sudo systemctl restart portal-web
```

> ⚠️ Sempre aplique as migrations **antes** de reiniciar a API. As migrations são projetadas para retrocompatibilidade — uma versão N da API funciona com o schema N ou N+1.

---

## Troubleshooting

### API não responde em `/api/health/ready`

```bash
# Verificar se o processo está rodando
# Docker:
docker compose -f docker-compose.prod.yml ps api
docker compose -f docker-compose.prod.yml logs api --tail 50

# Nativo:
sudo systemctl status portal-api
sudo journalctl -u portal-api -n 50 --no-pager

# Testar conexão manual com o banco
psql "postgresql://portal_app:<senha>@localhost:5432/portal" -c "SELECT 1"
```

### Erro "superuser bypasses row security"

Este erro indica que a `DATABASE_URL` está apontando para o usuário `postgres` (superusuário). Corrija imediatamente:

```bash
grep DATABASE_URL /opt/portal-prefeitura/.env
# Deve mostrar portal_app, NUNCA postgres
```

Se mostrar `postgres`, troque para `portal_app` e reinicie a API.

### PostGIS não está instalado

```bash
# Docker:
docker exec portal-postgres psql -U postgres -d portal \
  -c "SELECT PostGIS_Version();"
# Se der erro, crie a extensão:
docker exec portal-postgres psql -U postgres -d portal \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Nativo:
sudo -u postgres psql -d portal -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### Redis: conexão recusada

```bash
# Verificar se Redis está rodando
# Docker:
docker compose -f docker-compose.prod.yml logs redis --tail 20

# Nativo:
sudo systemctl status redis-server
redis-cli -a '<senha-redis>' -n 1 ping
```

Confirme que `REDIS_DB=1` e `BULLMQ_PREFIX=portal` estão no `.env`. Se outro serviço usar o mesmo Redis, nunca use o mesmo DB (Evolution API usa DB 6 por padrão).

### MinIO: acesso negado ao bucket

```bash
source /opt/portal-prefeitura/.env
mc alias set portal-local http://127.0.0.1:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"

# Verificar se o bucket existe
mc ls portal-local
# Se não existir, criar:
mc mb portal-local/portal
```

Confirme que `STORAGE_FORCE_PATH_STYLE=true` está no `.env` (obrigatório para MinIO).

### n8n não conecta ao banco

O n8n usa `portal_app` no compose. Verifique se a senha no `docker-compose.prod.yml` bate com a do banco. Logs:

```bash
docker compose -f docker-compose.prod.yml logs n8n --tail 30
```

### Migrations falharam na primeira subida

```bash
# Verificar quais tabelas foram criadas
docker exec portal-postgres psql -U portal_app -d portal -c "\dt" | wc -l

# Rodar migrations manualmente (dentro do container ou via psql externo)
for f in /opt/portal-prefeitura/db/*.sql; do
  echo "==> $f"
  docker exec -i portal-postgres psql -U portal_app -d portal < "$f"
done
```

### Nginx retorna 502 Bad Gateway

```bash
# Verificar se API e Web estão escutando
curl -v http://127.0.0.1:3001/api/health/ready
curl -v http://127.0.0.1:3000/

# Verificar logs do Nginx
sudo tail -50 /var/log/nginx/error.log

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl reload nginx
```

---

## Checklist de segurança (pré go-live)

Execute esta checklist antes de expor o portal à internet.

```
Sistema operacional e rede
[ ] ufw ativo: apenas 22, 80, 443 abertos externamente
[ ] fail2ban configurado e ativo
[ ] Atualizações de segurança do SO aplicadas (unattended-upgrades habilitado)
[ ] Nenhuma porta de banco (5432, 6432, 6379), storage (9000, 9001) ou n8n (5678) aberta externamente
[ ] SSH por chave; PasswordAuthentication no sshd_config = no
[ ] Root login desabilitado no SSH

Banco de dados (RLS)
[ ] portal_app tem NOSUPERUSER e NOBYPASSRLS (confirmar via pg_roles)
[ ] portal_ro tem NOSUPERUSER e NOBYPASSRLS
[ ] DATABASE_URL aponta para portal_app (nunca para postgres)
[ ] PostGIS instalado e funcional
[ ] 62 migrations aplicadas (contar tabelas com \dt)
[ ] Policies de RLS ativas nas tabelas principais (\dp manifestacoes)

Aplicação
[ ] AUTH_JWT_SECRET tem pelo menos 32 chars aleatórios (openssl rand -hex 32)
[ ] CPF_PEPPER definido (openssl rand -hex 32) e armazenado no cofre
[ ] METRICS_TOKEN definido (não vazio em produção)
[ ] ALLOWED_ORIGINS lista apenas os domínios das prefeituras (não *)
[ ] CLAMAV_HOST configurado se houver antivírus instalado
[ ] .env não está versionado no git (verificar .gitignore)
[ ] Segredos reais estão em cofre (Vault, Bitwarden, etc.), não em texto claro em arquivos

TLS e rede
[ ] Certificado TLS válido instalado (Let's Encrypt ou Cloudflare)
[ ] HTTP redireciona para HTTPS (301 permanente)
[ ] HSTS habilitado (Strict-Transport-Security com includeSubDomains)
[ ] Headers de segurança presentes (X-Content-Type-Options, X-Frame-Options, etc.)
[ ] Nginx não expõe versão (server_tokens off no nginx.conf)
[ ] API acessível apenas via Nginx (ports ligados em 127.0.0.1:3001)
[ ] Web acessível apenas via Nginx (ports ligados em 127.0.0.1:3000)

Operação
[ ] restart: always (Docker) ou Restart=always (systemd) configurados
[ ] Backups automáticos de banco e MinIO agendados e testados
[ ] Restore do backup testado em ambiente isolado
[ ] Logs sendo coletados e com rotação configurada
[ ] Alertas de saúde configurados (healthcheck falhando, fila crescendo, SLA vencendo)
[ ] Smoke tests passando: /api/health/ready retorna 200
[ ] Tenant de teste criado com slug 'exemplolandia' (não criar com dados de clientes reais)
```

---

## Referências

- [12 — Infraestrutura (Servidor Lidera)](../12-infraestrutura.md) — topologia de produção no Windows Server / WSL2
- [04 — Segurança](../04-seguranca.md) — modelo de ameaças, RBAC, hardening
- [07b — Banco de Dados](../07-banco-de-dados.md) — modelo de dados, RLS, PostGIS
- [Runbook Backup/Restore](../operacao/backup-restore-runbook.md) — procedimentos detalhados de backup, restore e teste mensal
- [Borda Cloudflare/WAF](../operacao/borda-cloudflare-waf-geo.md) — configuração de WAF e geo-bloqueio
- [CLAUDE.md](../../CLAUDE.md) — regras invioláveis do projeto (RLS, RBAC, fronteira de camadas)
