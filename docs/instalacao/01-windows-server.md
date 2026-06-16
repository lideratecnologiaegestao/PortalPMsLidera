# Manual de Instalação — Portal de Prefeitura em Windows Server (2019/2022)

> **Versao:** 1.0 — 2026-06-16
> **Publico-alvo:** operador de infraestrutura Lidera que vai subir o portal para uma prefeitura
> **Ambiente de referencia:** SRV-LIDERA-00 (Windows Server 2022, WSL2/Ubuntu, Docker)

---

## Sumario

1. [Visao Geral e Arquitetura](#1-visao-geral-e-arquitetura)
2. [Pre-requisitos de Hardware e Software](#2-pre-requisitos-de-hardware-e-software)
3. [Abordagem 1 (Recomendada) — Docker em WSL2](#3-abordagem-1-recomendada--docker-em-wsl2)
4. [Abordagem 2 — Instalacao Nativa em Windows](#4-abordagem-2--instalacao-nativa-em-windows)
5. [Configuracao do Banco de Dados](#5-configuracao-do-banco-de-dados)
6. [Variaveis de Ambiente](#6-variaveis-de-ambiente)
7. [Build e Execucao da API e do Portal Web](#7-build-e-execucao-da-api-e-do-portal-web)
8. [Reverse Proxy e TLS](#8-reverse-proxy-e-tls)
9. [Pos-Instalacao: Tenant e Smoke Test](#9-pos-instalacao-tenant-e-smoke-test)
10. [Operacao: Backup, Logs, Auto-start e Atualizacao](#10-operacao-backup-logs-auto-start-e-atualizacao)
11. [Troubleshooting](#11-troubleshooting)
12. [Checklist Final de Seguranca](#12-checklist-final-de-seguranca)

---

## 1. Visao Geral e Arquitetura

O **Portal de Prefeitura** e uma plataforma SaaS multi-tenant: um unico codigo serve N prefeituras (tenants) simultaneamente. O isolamento entre tenants e garantido por **Row Level Security (RLS)** no PostgreSQL — cada prefeitura so ve seus proprios dados. O tenant ativo e resolvido pelo hostname da requisicao (`Host` HTTP), sem necessidade de instancias separadas ou containers por prefeitura.

A fronteira de camadas e inviolavel: **web e app falam somente com a API**. Nao ha acesso direto do frontend ao banco, ao storage, as filas nem a qualquer servico externo. Uploads chegam como multipart para a API, que grava no MinIO.

```mermaid
flowchart TB
    subgraph Internet
        U[Cidadao / Navegador]
        APP[App do Cidadao]
    end
    U --> CF[Cloudflare Zero Trust]
    APP --> CF
    CF --> NG["Nginx (Windows ou WSL2)\n127.0.0.1:80"]
    NG -->|"Host: *.prefeitura.gov.br\n/"| WEB["portal-web\n:3000 (Next.js 14)"]
    NG -->|"/api/ e /midia/"| API["portal-api\n:3001 (NestJS 10)"]
    WEB -->|"todas as chamadas\nvao para a API"| API
    subgraph backend["Backend (Docker / WSL2)"]
        API --> PG[("portal-postgres\nPostGIS 16 — :5432")]
        API --> PGB["pgbouncer\n:6432 (transaction pool)"]
        PGB --> PG
        API --> RD[("Redis 7\n:6379")]
        API --> MN[("MinIO\n:9000 S3 / :9001 console")]
        API --> N8N["n8n ETL\n:5678"]
        WORK["Workers BullMQ"] --> RD
        WORK --> PG
    end
    API --> GOVBR["gov.br OIDC\n(externo)"]
    API --> ANT["API Anthropic IA\n(externo)"]
```

### Componentes e portas

| Componente | Imagem / Tecnologia | Porta(s) | Notas |
|---|---|---|---|
| **portal-postgres** | `postgis/postgis:16-3.4` | 5432 | Banco `portal`; papeis `portal_app` e `portal_ro` |
| **pgbouncer** | `edoburu/pgbouncer` | 6432 | `POOL_MODE=transaction`; opcional porem recomendado em producao |
| **Redis** | `redis:7-alpine` | 6379 | `REDIS_DB=1`, `BULLMQ_PREFIX=portal` (nao colide com Evolution no DB 6) |
| **MinIO** | `minio/minio` | 9000 (S3), 9001 (console) | Bucket `portal`; acessado exclusivamente pela API |
| **n8n** | `n8nio/n8n` | 5678 | ETL / integracoes contabeis |
| **portal-api** | NestJS 10 (Dockerfile multistage `node:20-alpine`) | 3001 | Base path `/api`; readiness `GET /api/health/ready` |
| **portal-web** | Next.js 14 App Router (output standalone) | 3000 | SSR/ISR; tema dinamico por tenant |
| **ClamAV** (opcional) | `clamav/clamav` | 3310 | Antivirus de uploads; omitir em dev |
| **Nginx para Windows** | nginx/Windows | 80 (local) | Reverse proxy; TLS na borda do Cloudflare |

---

## 2. Pre-requisitos de Hardware e Software

### Hardware minimo (producao mono-servidor)

| Recurso | Minimo | Recomendado |
|---|---|---|
| CPU | 4 vCPUs | 8 vCPUs |
| RAM | 8 GB | 16 GB |
| Disco OS | 60 GB SSD | 100 GB SSD |
| Disco dados | 100 GB | 500 GB (volumes Docker) |
| Rede | 100 Mbps | 1 Gbps |

### Software necessario (Abordagem 1 — Docker em WSL2)

| Software | Versao minima | Fonte |
|---|---|---|
| Windows Server | 2019 (build 1809+) ou 2022 | Ja instalado |
| WSL2 | kernel 5.10+ | `wsl --update` |
| Ubuntu (via WSL2) | 22.04 LTS ou 24.04 LTS | Microsoft Store / `wsl --install` |
| Docker Engine (no Ubuntu/WSL2) | 25+ | docs.docker.com/engine |
| Git for Windows | 2.x | gitforwindows.org |
| Nginx para Windows | 1.25+ | nginx.org/en/download |

### Software necessario (Abordagem 2 — Nativa)

| Software | Versao | Fonte |
|---|---|---|
| Node.js | 20 LTS | nodejs.org |
| PostgreSQL | 16 | enterprisedb.com |
| PostGIS | 3.4 (via Stack Builder) | postgis.net |
| Redis (Memurai) | 4.x | memurai.com |
| MinIO para Windows | release mais recente | min.io |
| NSSM ou PM2 | ultima versao | nssm.cc / pm2.io |
| Git for Windows | 2.x | gitforwindows.org |
| Nginx para Windows | 1.25+ | nginx.org |

---

## 3. Abordagem 1 (Recomendada) — Docker em WSL2

Esta e a abordagem usada pelo **Servidor Lidera** em producao. Docker em WSL2 oferece compatibilidade nativa com Linux, facilita a gerencia de dependencias (Tesseract, PostGIS, etc.) e simplifica atualizacoes e backups via volumes Docker.

### 3.1 Habilitar WSL2 no Windows Server

Abra o PowerShell **como Administrador**:

```powershell
# Habilitar recurso WSL e plataforma de VM
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Reiniciar o servidor
Restart-Computer -Force
```

Apos reiniciar, no PowerShell como Administrador:

```powershell
# Definir WSL2 como versao padrao
wsl --set-default-version 2

# Atualizar o kernel do WSL2 (baixa o pacote oficial da Microsoft)
wsl --update

# Instalar Ubuntu 22.04 LTS (sem interface grafica)
wsl --install -d Ubuntu-22.04

# Verificar que esta rodando em WSL2
wsl -l -v
```

> ⚠️ No Windows Server 2019/2022, a Microsoft Store pode nao estar disponivel. Nesse caso baixe o pacote `.appx` do Ubuntu diretamente:
>
> ```powershell
> # Baixar e instalar Ubuntu 22.04 sem a Store
> Invoke-WebRequest -Uri "https://aka.ms/wslubuntu2204" `
>     -OutFile "$env:TEMP\ubuntu2204.appx" -UseBasicParsing
> Add-AppxPackage "$env:TEMP\ubuntu2204.appx"
> ```

Na primeira execucao do Ubuntu, defina um usuario e senha para o ambiente Linux. **Este usuario nao precisa ter relacao com o admin do Windows.**

```bash
# Dentro do Ubuntu (WSL2) — primeira configuracao
# Defina usuario e senha quando solicitado
# Exemplo: usuario 'lidera', senha forte
```

### 3.2 Habilitar systemd no WSL2

O systemd permite que servicos iniciem automaticamente dentro do WSL. Edite (dentro do Ubuntu):

```bash
sudo nano /etc/wsl.conf
```

Adicione o conteudo:

```ini
[boot]
systemd=true

[automount]
options = "metadata"
```

Saia do Ubuntu e reinicie a distribuicao no PowerShell:

```powershell
wsl --shutdown
wsl -d Ubuntu-22.04
```

Verifique:

```bash
# Dentro do Ubuntu
systemctl --no-pager status
# Deve mostrar "State: running"
```

### 3.3 Instalar Docker Engine no Ubuntu (WSL2)

Dentro do Ubuntu:

```bash
# Remover versoes antigas (se houver)
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Instalar dependencias
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Adicionar chave GPG oficial do Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Adicionar repositorio Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker Engine e plugins
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

# Habilitar e iniciar o daemon Docker
sudo systemctl enable docker
sudo systemctl start docker

# Adicionar seu usuario ao grupo docker (evita precisar de sudo)
sudo usermod -aG docker $USER

# Sair e entrar novamente para o grupo surtir efeito
exit
```

Reabra o Ubuntu e verifique:

```bash
docker version
docker compose version
# Ambos devem exibir versoes sem erro
```

### 3.4 Configurar auto-start do WSL2 no boot do Windows

O WSL2 nao inicia automaticamente no boot do servidor sem uma tarefa agendada. No PowerShell como Administrador:

```powershell
# Criar script de inicio do WSL
$startScript = @'
wsl -d Ubuntu-22.04 -u lidera -- bash -c "cd /home/lidera/portal && docker compose up -d >> /home/lidera/logs/startup.log 2>&1"
'@

$scriptPath = "C:\Scripts\start-portal-wsl.ps1"
New-Item -ItemType Directory -Force -Path "C:\Scripts" | Out-Null
Set-Content -Path $scriptPath -Value $startScript -Encoding UTF8

# Criar tarefa agendada que roda na inicializacao do sistema
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -WindowStyle Hidden -File C:\Scripts\start-portal-wsl.ps1"

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName "Portal-Prefeitura-WSL-Start" `
    -Action $action `
    -Trigger $trigger `
    -RunLevel Highest `
    -User "SYSTEM" `
    -Settings $settings `
    -Force

Write-Host "Tarefa agendada criada com sucesso."
```

> ⚠️ Substitua `lidera` pelo usuario Linux que voce criou no WSL2. O diretorio do projeto sera `/home/lidera/portal`.

### 3.5 Instalar Git e clonar o repositorio

No PowerShell (Windows):

```powershell
# Verificar se Git for Windows esta instalado
git --version

# Se nao estiver, baixar o instalador silencioso
$gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.45.2.windows.1/Git-2.45.2-64-bit.exe"
Invoke-WebRequest -Uri $gitUrl -OutFile "$env:TEMP\git-installer.exe" -UseBasicParsing
Start-Process -FilePath "$env:TEMP\git-installer.exe" `
    -ArgumentList "/VERYSILENT /NORESTART /COMPONENTS=icons,ext\reg\shellhere,assoc,assoc_sh" `
    -Wait
```

Dentro do Ubuntu (WSL2), clone o repositorio:

```bash
# Criar estrutura de diretorios
mkdir -p /home/lidera/portal
cd /home/lidera

# Clonar o repositorio
git clone https://github.com/sua-org/portal-prefeitura.git portal
# Substitua pela URL real do repositorio Git da Lidera

cd portal
```

### 3.6 Configurar as variaveis de ambiente

```bash
# Dentro do Ubuntu, no diretorio do projeto
cd /home/lidera/portal

# Copiar o arquivo de exemplo
cp .env.example portal.env

# Editar com nano ou vim
nano portal.env
```

Veja a secao [6. Variaveis de Ambiente](#6-variaveis-de-ambiente) para o guia completo de preenchimento.

> ⚠️ O arquivo `.env` NAO deve existir no diretorio do projeto em producao. Use `portal.env` e aponte via `--env-file` ou crie um `.env` fora do repositorio git. **Nunca commite segredos.**

### 3.7 Configurar docker compose para producao

Em producao no Servidor Lidera, o Redis e a Evolution API ja existem e rodam na rede Docker `evolution-net`. Crie um arquivo `docker-compose.prod.yml` na raiz do projeto (dentro do Ubuntu):

```bash
cat > /home/lidera/portal/docker-compose.prod.yml << 'EOF'
# Composicao para PRODUCAO no Servidor Lidera
# Reusa redis e evolution existentes; provisiona postgres+minio+n8n+api+web proprios.
services:
  portal-postgres:
    image: postgis/postgis:16-3.4
    container_name: portal-postgres
    restart: always
    environment:
      POSTGRES_DB: portal
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_ROOT_PASSWORD}
    volumes:
      - portal_pg_data:/var/lib/postgresql/data
      - ./db:/docker-entrypoint-initdb.d:ro
    networks:
      - evolution-net
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d portal']
      interval: 10s
      timeout: 5s
      retries: 10

  portal-pgbouncer:
    image: edoburu/pgbouncer:latest
    container_name: portal-pgbouncer
    restart: always
    environment:
      DB_HOST: portal-postgres
      DB_PORT: 5432
      DB_USER: portal_app
      DB_PASSWORD: ${DB_APP_PASSWORD}
      DB_NAME: portal
      POOL_MODE: transaction
      MAX_CLIENT_CONN: 200
      DEFAULT_POOL_SIZE: 20
      AUTH_TYPE: scram-sha-256
    depends_on:
      portal-postgres:
        condition: service_healthy
    networks:
      - evolution-net

  portal-minio:
    image: minio/minio:latest
    container_name: portal-minio
    restart: always
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY}
    volumes:
      - portal_minio_data:/data
    networks:
      - evolution-net

  portal-n8n:
    image: n8nio/n8n:latest
    container_name: portal-n8n
    restart: always
    environment:
      N8N_HOST: localhost
      N8N_PORT: 5678
      N8N_PROTOCOL: http
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: portal-postgres
      DB_POSTGRESDB_DATABASE: portal
      DB_POSTGRESDB_USER: portal_app
      DB_POSTGRESDB_PASSWORD: ${DB_APP_PASSWORD}
    depends_on:
      portal-postgres:
        condition: service_healthy
    volumes:
      - portal_n8n_data:/home/node/.n8n
    networks:
      - evolution-net

  portal-api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: portal-api
    restart: always
    env_file: /home/lidera/portal/portal.env
    environment:
      DATABASE_URL: postgresql://portal_app:${DB_APP_PASSWORD}@portal-pgbouncer:6432/portal?pgbouncer=true
    ports:
      - "127.0.0.1:3001:3001"
    depends_on:
      portal-pgbouncer:
        condition: service_started
    networks:
      - evolution-net
    healthcheck:
      test: ['CMD-SHELL', 'node -e "require(''http'').get(''http://127.0.0.1:3001/api/health/ready'',r=>process.exit(r.statusCode===200?0:1)).on(''error'',()=>process.exit(1))"']
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s

  portal-web:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: portal-web
    restart: always
    environment:
      API_URL: http://portal-api:3001
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - portal-api
    networks:
      - evolution-net

volumes:
  portal_pg_data:
  portal_minio_data:
  portal_n8n_data:

networks:
  evolution-net:
    external: true
EOF
```

> ⚠️ Se o servidor NAO possui a rede `evolution-net` (instalacao limpa sem Evolution API), crie a rede antes de subir:
>
> ```bash
> docker network create evolution-net
> ```
>
> Ou altere a secao `networks` para criar uma rede dedicada ao portal:
>
> ```yaml
> networks:
>   portal-net:
>     driver: bridge
> ```

### 3.8 Subir os containers

```bash
cd /home/lidera/portal

# Primeira subida: constroi as imagens e sobe tudo
# As 62 migrations em db/*.sql rodam automaticamente no postgres
# via /docker-entrypoint-initdb.d (em ordem alfabetica) na primeira inicializacao
docker compose -f docker-compose.prod.yml --env-file portal.env up -d --build

# Acompanhar os logs em tempo real
docker compose -f docker-compose.prod.yml logs -f

# Verificar status de todos os containers
docker compose -f docker-compose.prod.yml ps
```

Aguarde todos os containers aparecerem com status `healthy` ou `running`. O `portal-postgres` demora cerca de 60-120 segundos na primeira subida para rodar as migrations.

### 3.9 Criar bucket no MinIO

```bash
# Instalar cliente MinIO (mc) dentro do Ubuntu
curl https://dl.min.io/client/mc/release/linux-amd64/mc \
    --create-dirs -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configurar alias (use as credenciais do portal.env)
mc alias set portal-local http://localhost:9000 \
    <STORAGE_ACCESS_KEY> <STORAGE_SECRET_KEY>

# Criar o bucket 'portal'
mc mb portal-local/portal

# Verificar
mc ls portal-local
```

---

## 4. Abordagem 2 — Instalacao Nativa em Windows

> ⚠️ Esta abordagem e mais complexa de operar e atualizar. Alguns componentes (n8n, ClamAV) sao significativamente mais faceis de executar em container. Use esta abordagem somente quando WSL2 nao estiver disponivel.

### 4.1 Instalar Node.js 20 LTS

```powershell
# Baixar instalador LTS do Node.js 20
$nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
Invoke-WebRequest -Uri $nodeUrl -OutFile "$env:TEMP\nodejs.msi" -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\nodejs.msi /quiet /norestart" -Wait

# Verificar (abrir novo PowerShell)
node --version   # deve exibir v20.x.x
npm --version
```

### 4.2 Instalar PostgreSQL 16 com PostGIS

Baixe o instalador do PostgreSQL 16 em https://www.enterprisedb.com/downloads/postgres-postgresql-downloads e execute com interface grafica, ou:

```powershell
# Instalador silencioso (ajuste a versao se necessario)
$pgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.3-1-windows-x64.exe"
Invoke-WebRequest -Uri $pgUrl -OutFile "$env:TEMP\pg16.exe" -UseBasicParsing
Start-Process "$env:TEMP\pg16.exe" -ArgumentList `
    "--mode unattended --superpassword <senha-super-postgres> --serverport 5432" -Wait
```

Apos a instalacao, use o **Stack Builder** (incluido com o PostgreSQL) para instalar a extensao PostGIS 3.4:

```powershell
# Iniciar Stack Builder (interface grafica)
Start-Process "C:\Program Files\PostgreSQL\16\bin\stackbuilder.exe"
# Selecione: PostgreSQL 16 -> Spatial Extensions -> PostGIS 3.4 Bundle
```

### 4.3 Criar os papeis e o banco de dados

```powershell
# Configurar variavel de ambiente temporaria com o path do psql
$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"

# Criar banco e papeis
psql -U postgres -h localhost -c "CREATE DATABASE portal;"
psql -U postgres -h localhost -c @"
CREATE ROLE portal_app LOGIN PASSWORD '<defina-forte>' NOSUPERUSER NOBYPASSRLS;
CREATE ROLE portal_ro  LOGIN PASSWORD '<defina-forte>' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
"@

# Habilitar PostGIS e pgvector no banco portal
psql -U postgres -h localhost -d portal -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql -U postgres -h localhost -d portal -c "CREATE EXTENSION IF NOT EXISTS postgis_topology;"
psql -U postgres -h localhost -d portal -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
```

### 4.4 Instalar Redis via Memurai

O Redis oficial nao tem build nativa para Windows. O **Memurai** e um fork compativel licenciado para uso em producao:

```powershell
# Baixar Memurai (verificar versao atual em memurai.com)
$memuraiUrl = "https://www.memurai.com/downloads/memurai-developer.msi"
Invoke-WebRequest -Uri $memuraiUrl -OutFile "$env:TEMP\memurai.msi" -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\memurai.msi /quiet" -Wait

# Memurai instala e registra como servico Windows automaticamente
# Configurar senha (editar C:\Program Files\Memurai\memurai.conf)
# Adicionar: requirepass <defina-forte>
# Reiniciar o servico
Restart-Service Memurai
```

> ⚠️ O Memurai Developer Edition e gratuito ate 4 GB de RAM. Para producao com volumes maiores, adquira licenca comercial ou use Redis via WSL2 parcial.

### 4.5 Instalar MinIO para Windows

```powershell
# Criar diretorio de dados
New-Item -ItemType Directory -Force -Path "D:\MinIO\data"
New-Item -ItemType Directory -Force -Path "D:\MinIO\bin"

# Baixar binario do MinIO para Windows
$minioUrl = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
Invoke-WebRequest -Uri $minioUrl -OutFile "D:\MinIO\bin\minio.exe" -UseBasicParsing

# Criar script de inicializacao
$minioScript = @'
$env:MINIO_ROOT_USER = "<defina>"
$env:MINIO_ROOT_PASSWORD = "<defina-forte>"
D:\MinIO\bin\minio.exe server D:\MinIO\data --console-address ":9001" --address ":9000"
'@
Set-Content -Path "D:\MinIO\start-minio.ps1" -Value $minioScript
```

### 4.6 Instalar NSSM para gerenciar servicos Windows

O NSSM (Non-Sucking Service Manager) permite registrar qualquer processo como servico Windows com restart automatico:

```powershell
# Baixar NSSM
$nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
Invoke-WebRequest -Uri $nssmUrl -OutFile "$env:TEMP\nssm.zip" -UseBasicParsing
Expand-Archive "$env:TEMP\nssm.zip" -DestinationPath "$env:TEMP\nssm"
Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" -Destination "C:\Windows\System32\"
```

### 4.7 Configurar variaveis de ambiente e instalar dependencias

```powershell
# Definir variaveis de sistema para a API (sera lida pelo processo)
[System.Environment]::SetEnvironmentVariable("DATABASE_URL",
    "postgresql://portal_app:<senha>@localhost:5432/portal",
    "Machine")
[System.Environment]::SetEnvironmentVariable("REDIS_HOST", "localhost", "Machine")
[System.Environment]::SetEnvironmentVariable("REDIS_PORT", "6379",     "Machine")
# ... repita para todas as variaveis (ver secao 6)

# Instalar dependencias da API
cd D:\Site\portal-prefeitura\api
npm install
npm run prisma:generate
npm run build

# Instalar dependencias do Web
cd D:\Site\portal-prefeitura\web
npm install
npm run build
```

### 4.8 Registrar API e Web como servicos Windows com NSSM

```powershell
# Registrar portal-api como servico
nssm install portal-api "node" "D:\Site\portal-prefeitura\api\dist\main.js"
nssm set portal-api AppDirectory "D:\Site\portal-prefeitura\api"
nssm set portal-api AppEnvironmentExtra "PORT=3001"
nssm set portal-api Start SERVICE_AUTO_START
nssm set portal-api AppStdout "D:\Site\portal-prefeitura\logs\api-stdout.log"
nssm set portal-api AppStderr "D:\Site\portal-prefeitura\logs\api-stderr.log"

# Registrar portal-web como servico
nssm install portal-web "node" "D:\Site\portal-prefeitura\web\.next\standalone\server.js"
nssm set portal-web AppDirectory "D:\Site\portal-prefeitura\web\.next\standalone"
nssm set portal-web AppEnvironmentExtra "PORT=3000`nAPI_URL=http://localhost:3001"
nssm set portal-web Start SERVICE_AUTO_START
nssm set portal-web AppStdout "D:\Site\portal-prefeitura\logs\web-stdout.log"
nssm set portal-web AppStderr "D:\Site\portal-prefeitura\logs\web-stderr.log"

# Iniciar os servicos
nssm start portal-api
nssm start portal-web

# Registrar MinIO como servico
nssm install portal-minio "powershell.exe" "-File D:\MinIO\start-minio.ps1"
nssm set portal-minio Start SERVICE_AUTO_START
nssm start portal-minio
```

> ⚠️ **Limitacoes da abordagem nativa:**
> - **n8n** nao tem distribuicao oficial para Windows como servico; precisa de Node.js + PM2 ou de um container WSL2 parcial.
> - **ClamAV** no Windows requer compilacao manual ou o instalador do ClamWin, que nao expoe o daemon `clamd` na porta 3310 por padrao.
> - **Tesseract OCR** precisa ser instalado separadamente em `C:\Program Files\Tesseract-OCR` e adicionado ao `PATH` para a API fazer OCR de PDFs. Baixe em https://github.com/UB-Mannheim/tesseract/wiki.
> - **poppler-utils** (pdftoppm) nao tem instalador oficial para Windows; use a compilacao de terceiros disponivel em https://github.com/oschwartz10612/poppler-windows/releases.
> - Atualizacoes de versao exigem rebuild manual e reinicializacao de cada servico.

---

## 5. Configuracao do Banco de Dados

Esta secao se aplica a ambas as abordagens. Na Abordagem 1 (Docker), a maioria dos passos ja e automatizada na primeira subida do container.

### 5.1 Criar papeis de acesso

> ⚠️ **CRITICO: nunca conecte a API como superusuario `postgres`.** O superusuario do PostgreSQL ignora TODAS as policies de Row Level Security, o que quebraria o isolamento entre prefeituras — todos os tenants veriam dados uns dos outros.

```sql
-- Conectar como superusuario APENAS para criar os papeis
-- (em Docker: docker exec -it portal-postgres psql -U postgres)

-- Papel de aplicacao: sem superusuario, sem BYPASSRLS
CREATE ROLE portal_app LOGIN PASSWORD '<defina-forte>'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- Papel somente-leitura: para relatorios e MCP postgres
CREATE ROLE portal_ro LOGIN PASSWORD '<defina-forte>'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- Conceder acesso ao banco
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;

-- Conceder uso do schema public
GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;

-- portal_app: CRUD completo
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO portal_app;

-- portal_ro: somente leitura
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO portal_ro;
```

### 5.2 Habilitar extensoes necessarias

```sql
-- Como superusuario, no banco portal
\c portal

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- busca full-text (FTS)
CREATE EXTENSION IF NOT EXISTS unaccent; -- normalizacao para FTS em portugues
```

Para busca semantica (opcional — Camada 4 da IA, requer VOYAGE_API_KEY):

```sql
-- Opcional: pgvector para embeddings semanticos
-- Em Docker, a imagem postgis/postgis:16-3.4 nao inclui pgvector por padrao.
-- Use db/optional/ ou instale a extensao: ver docs/ia-base-conhecimento.md
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5.3 Rodar as 62 migrations SQL

As migrations estao em `db/*.sql` (arquivos 001 a 062). Em Docker, elas rodam automaticamente via `/docker-entrypoint-initdb.d` na primeira subida. Para rodar manualmente:

**No Ubuntu/WSL2 (Abordagem 1, caso seja necessario re-executar):**

```bash
cd /home/lidera/portal

# Definir a URL de conexao (como superusuario para criar roles/extensions)
export DATABASE_URL="postgresql://postgres:<senha-super>@localhost:5432/portal"

# Rodar em ordem alfabetica
for f in db/*.sql; do
    echo "Rodando $f ..."
    psql "$DATABASE_URL" -f "$f"
done

# Migrations opcionais (pgvector para busca semantica)
# for f in db/optional/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

**No PowerShell (Abordagem 2 — Windows nativo):**

```powershell
# Configurar variavel com a URL de conexao
$env:DATABASE_URL = "postgresql://postgres:<senha-super>@localhost:5432/portal"
# Adicionar psql ao PATH se necessario
$env:PATH += ";C:\Program Files\PostgreSQL\16\bin"

# Rodar migrations em ordem alfabetica
Get-ChildItem "D:\Site\portal-prefeitura\db\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Rodando $($_.Name) ..."
    psql $env:DATABASE_URL -f $_.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Falha na migration $($_.Name). Interrompendo."
        break
    }
}

Write-Host "Todas as migrations concluidas."
```

### 5.4 Verificar RLS

```sql
-- Verificar que RLS esta habilitado nas tabelas de tenant
-- Conectar como portal_app (nao como superusuario)
\c portal portal_app

-- Deve retornar apenas registros do tenant configurado na sessao
-- (ou vazio se nenhum tenant foi setado)
SELECT id, slug FROM tenants LIMIT 5;

-- Confirmar que as policies existem
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;
```

---

## 6. Variaveis de Ambiente

Copie o arquivo `.env.example` da raiz do repositorio para um local fora do git em producao:

```bash
# Ubuntu/WSL2
cp /home/lidera/portal/.env.example /home/lidera/portal/portal.env
chmod 600 /home/lidera/portal/portal.env
```

```powershell
# PowerShell (Windows nativo)
Copy-Item "D:\Site\portal-prefeitura\.env.example" `
          "D:\Secrets\portal.env"
# Restricao de ACL para apenas o usuario do servico
icacls "D:\Secrets\portal.env" /inheritance:r /grant:r "SYSTEM:F" /grant:r "$env:USERNAME:F"
```

> ⚠️ **Use um cofre de segredos.** Nunca versione o arquivo com valores reais no git. Opcoes recomendadas:
> - **HashiCorp Vault** (self-hosted): integra com Docker via secrets ou env inject
> - **Vaultwarden** (Bitwarden self-hosted): para equipes pequenas, acesso via UI
> - **Windows DPAPI / Credential Manager**: para segredos do sistema local
> - **Azure Key Vault / AWS Secrets Manager**: para nuvem
>
> Em producao minima, mantenha o `portal.env` com permissao `600` (Linux) ou ACL restrita (Windows), fora do repositorio git, e faca backup cifrado com GPG (ver secao 10).

### Tabela de variaveis obrigatorias

| Variavel | Exemplo / Instrucao | Critica |
|---|---|---|
| `DATABASE_URL` | `postgresql://portal_app:<senha>@portal-pgbouncer:6432/portal?pgbouncer=true` | **Nunca usar superusuario** |
| `DATABASE_URL_READONLY` | `postgresql://portal_ro:<senha>@portal-postgres:5432/portal` | Para MCP/relatorios |
| `REDIS_HOST` | `redis` (Docker) ou `localhost` (nativo) | |
| `REDIS_PORT` | `6379` | |
| `REDIS_PASSWORD` | `<defina-forte>` | |
| `REDIS_DB` | `1` | Nao use o DB 6 (Evolution) |
| `BULLMQ_PREFIX` | `portal` | Obrigatorio para nao colidir |
| `STORAGE_ENDPOINT` | `http://portal-minio:9000` | |
| `STORAGE_BUCKET` | `portal` | |
| `STORAGE_ACCESS_KEY` | `<defina>` | |
| `STORAGE_SECRET_KEY` | `<defina-forte>` | |
| `STORAGE_FORCE_PATH_STYLE` | `true` | Obrigatorio para MinIO |
| `PORT` | `3001` | Porta da API |
| `ALLOWED_ORIGINS` | `https://barao.mt.gov.br,https://exemplolandia.lidera.app.br` | CORS |
| `AUTH_JWT_SECRET` | Minimo 32 chars — veja abaixo | Assina cookies de sessao |
| `AUTH_SESSION_TTL` | `8h` | |
| `CPF_PEPPER` | 64 chars hex — veja abaixo | LGPD: dedupe de CPF |
| `PUBLIC_API` | `https://api.sua-prefeitura.gov.br` | URL publica da API (webhooks) |

### Gerar segredos criptograficamente seguros

**No Ubuntu/WSL2:**

```bash
# AUTH_JWT_SECRET (minimo 32 chars, recomendado 64)
openssl rand -hex 32
# Exemplo de saida: 4a8f2c1d9e7b3a6f5c2d8e1f4a7b3c9d (NAO USE ESTE — gere o seu)

# CPF_PEPPER (LGPD: hash do CPF para dedupe sem guardar em claro)
openssl rand -hex 32
# Guarde em cofre. Se perder, nao ha como recuperar os hashes existentes.

# Senhas de banco e storage
openssl rand -base64 32
```

**No PowerShell:**

```powershell
# AUTH_JWT_SECRET
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

# Ou usando .NET
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

### Variaveis opcionais (habilitar funcionalidades)

| Variavel | Quando configurar |
|---|---|
| `GOVBR_CLIENT_ID` / `GOVBR_CLIENT_SECRET` / `GOVBR_REDIRECT_URI` | Login do cidadao via gov.br |
| `ANTHROPIC_API_KEY` + `IA_MODEL` | Triagem IA, chatbot, OCR inteligente |
| `VOYAGE_API_KEY` / `OPENAI_API_KEY` + `EMBEDDINGS_PROVIDER` | Busca semantica RAG (requer pgvector) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Notificacoes por e-mail |
| `GOOGLE_MAPS_API_KEY` | App do Cidadao — mapa de denuncias |
| `WHATSAPP_PROVIDER` + credenciais Z-API ou Evolution | Notificacoes WhatsApp |
| `CLAMAV_HOST` + `CLAMAV_PORT=3310` | Antivirus de uploads (container ClamAV) |
| `ICP_CERT_PATH` / `ICP_CERT_PASSWORD` / `DIARIO_SIGNING_KEY` | Assinatura do Diario Oficial (ICP-Brasil) |

---

## 7. Build e Execucao da API e do Portal Web

### 7.1 Docker (Abordagem 1)

Com Docker, o build e gerenciado pelos `Dockerfile` multistage. Nao e necessario instalar Node.js, Tesseract, poppler etc. no host.

```bash
# Build e subida (Abordagem 1 — dentro do Ubuntu/WSL2)
cd /home/lidera/portal

# Build das imagens (necessario apenas na primeira vez ou apos atualizacao de codigo)
docker compose -f docker-compose.prod.yml --env-file portal.env build

# Subir todos os servicos
docker compose -f docker-compose.prod.yml --env-file portal.env up -d

# Verificar saude
docker compose -f docker-compose.prod.yml ps

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f portal-api
docker compose -f docker-compose.prod.yml logs -f portal-web
```

O `api/Dockerfile` instala automaticamente em tempo de build:
- `openssl` — necessario para o Prisma Engine
- `postgresql16-client` — para o `pg_dump` dos backups automaticos
- `tesseract-ocr` + `tesseract-ocr-data-por` — OCR de PDFs escaneados em portugues
- `poppler-utils` — rasterizacao de paginas PDF (pdftoppm)

### 7.2 Modo desenvolvimento (sem Docker)

Para desenvolvimento local em Windows nativo ou WSL2 sem Docker:

```bash
# API
cd /home/lidera/portal/api
npm install
npm run prisma:generate   # regenera o Prisma Client apos mudar o schema
npm run start:dev         # modo watch com hot-reload

# Web (em outro terminal)
cd /home/lidera/portal/web
npm install
npm run dev
```

```powershell
# PowerShell — modo dev nativo
Set-Location "D:\Site\portal-prefeitura\api"
npm install
npm run prisma:generate
npm run start:dev
```

### 7.3 Verificar que a API esta saudavel

```bash
# Dentro do Ubuntu ou via curl no Windows
curl -s http://localhost:3001/api/health/ready
# Resposta esperada: HTTP 200 com JSON {"status":"ok"} ou similar

# PowerShell
Invoke-WebRequest -Uri "http://localhost:3001/api/health/ready" -UseBasicParsing |
    Select-Object StatusCode, Content
# StatusCode deve ser 200
```

---

## 8. Reverse Proxy e TLS

### 8.1 Visao geral da cadeia de TLS

```
Cidadao (HTTPS) -> Cloudflare Zero Trust (termina TLS publico)
                -> Nginx no Windows (HTTP local, porta 80)
                -> portal-web :3000 (Next.js)
                -> portal-api :3001 (NestJS, /api e /midia)
```

O TLS publico e gerenciado pelo Cloudflare. O Nginx recebe conexoes locais via HTTP (sem TLS local). A API nunca fica aberta diretamente para a internet.

### 8.2 Instalar Nginx para Windows

```powershell
# Criar diretorio
New-Item -ItemType Directory -Force -Path "C:\nginx"

# Baixar Nginx para Windows (versao estavel)
$nginxUrl = "https://nginx.org/download/nginx-1.26.1.zip"
Invoke-WebRequest -Uri $nginxUrl -OutFile "$env:TEMP\nginx.zip" -UseBasicParsing
Expand-Archive "$env:TEMP\nginx.zip" -DestinationPath "C:\"
Rename-Item "C:\nginx-1.26.1" "C:\nginx"

# Verificar
C:\nginx\nginx.exe -v
```

### 8.3 Configurar vhost curinga (multi-tenant)

O modelo de multi-tenancy e resolvido por **Host HTTP**. Um unico bloco `server` atende todas as prefeituras — o backend identifica o tenant pelo valor do header `Host`. Adicionar uma nova prefeitura nao requer alteracao no Nginx.

Crie o arquivo `C:\nginx\conf\sites\prefeitura.conf`:

```nginx
# Portal SaaS multi-tenant — vhost curinga
# Atrás do Cloudflare Zero Trust (TLS publico na borda CF; aqui e HTTP local).
#   /api/*  -> portal-api  (NestJS) em 127.0.0.1:3001
#   /midia/ -> portal-api  (midia publica mascarada)
#   /       -> portal-web  (Next.js) em 127.0.0.1:3000
#
# Um unico vhost atende TODAS as prefeituras: o backend resolve o tenant
# pelo Host. Nova prefeitura = nova linha em `tenants` -> ja no ar.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name *.lidera.app.br *.lidera.srv.br *.mt.gov.br *.mt.leg.br;

    access_log logs/prefeitura-access.log combined;
    error_log  logs/prefeitura-error.log;

    # Uploads multipart (fotos, anexos, PDFs do Diario)
    client_max_body_size 100m;

    # Bloquear acesso a arquivos sensiveis
    location ~ /\.(env|git|svn|ht) {
        deny all;
        return 404;
    }

    # ---- API (NestJS, global prefix /api) ----
    # Inclui WebSocket do chat interno (/api/socket.io)
    location /api/ {
        proxy_pass http://127.0.0.1:3001;

        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        $connection_upgrade;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # ---- Midia publica mascarada (stream via backend) ----
    location /midia/ {
        proxy_pass http://127.0.0.1:3001;

        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # ---- Portal publico + painel admin (Next.js SSR/ISR) ----
    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Host  $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Inclua o diretorio de sites no `nginx.conf` principal:

```powershell
# Verificar se o nginx.conf principal ja inclui o diretorio de sites
Get-Content "C:\nginx\conf\nginx.conf" | Select-String "include"

# Se nao incluir, adicionar dentro do bloco http {}
# Editar C:\nginx\conf\nginx.conf e adicionar antes do fechamento do bloco http:
#     include sites/*.conf;
```

### 8.4 Registrar Nginx como servico Windows

```powershell
# Usando NSSM (ja instalado na secao 4.6, ou instalar separadamente)
nssm install nginx "C:\nginx\nginx.exe"
nssm set nginx AppDirectory "C:\nginx"
nssm set nginx Start SERVICE_AUTO_START
nssm set nginx AppStdout "C:\nginx\logs\nginx-stdout.log"
nssm set nginx AppStderr "C:\nginx\logs\nginx-stderr.log"

# Iniciar
nssm start nginx

# Testar configuracao antes de reiniciar
C:\nginx\nginx.exe -t

# Recarregar configuracao sem downtime
C:\nginx\nginx.exe -s reload
```

### 8.5 Configurar Cloudflare Zero Trust

No painel do Cloudflare Zero Trust (https://one.dash.cloudflare.com):

1. Acesse **Networks > Tunnels** e selecione o tunel existente (ou crie um novo).
2. Em **Public Hostnames**, adicione entradas para cada prefeitura e para o gerenciador:

   | Subdominio | Servico | Notas |
   |---|---|---|
   | `*.lidera.app.br` | `http://127.0.0.1:80` | Curinga — cobre todas as prefeituras |
   | `gerenciador.lidera.app.br` | `http://127.0.0.1:80` | Painel da plataforma |
   | `api.prefeitura.gov.br` | `http://127.0.0.1:80` | Dominio proprio da prefeitura (se houver) |

3. Configure **Access Policies** para o painel admin (`/admin/*`) se desejar adicionar camada de autenticacao Cloudflare na frente do login da aplicacao.

> ⚠️ O `cloudflared` deve estar instalado e configurado no servidor. Em WSL2:
>
> ```bash
> curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
>     -o /tmp/cloudflared.deb
> sudo dpkg -i /tmp/cloudflared.deb
> cloudflared tunnel login
> cloudflared service install
> sudo systemctl enable cloudflared
> sudo systemctl start cloudflared
> ```

---

## 9. Pos-Instalacao: Tenant e Smoke Test

### 9.1 Criar o primeiro tenant

Com todos os containers rodando, acesse o banco como `portal_app` para inserir o primeiro tenant. Em producao, use o painel de gerenciamento da plataforma (`/plataforma/tenants/novo`). Para inicializacao manual:

```bash
# Dentro do Ubuntu/WSL2 (Abordagem 1)
docker exec -it portal-postgres psql -U portal_app -d portal
```

```sql
-- Inserir o tenant inicial (substituir pelos valores reais)
INSERT INTO tenants (
    slug,
    name,
    domain,
    theme,
    active
) VALUES (
    'exemplolandia',                        -- slug unico (nunca alterar apos criar)
    'Prefeitura Municipal de Exemplolândia',
    'exemplolandia.lidera.app.br',          -- dominio que vai no DNS/Cloudflare
    '{"primary":"#1351b4","secondary":"#2670e8"}',  -- cores no padrao gov.br
    true
) RETURNING id, slug, domain;
```

### 9.2 Criar o usuario administrador inicial

```sql
-- Inserir admin do tenant (senha sera hasheada pela API no primeiro login)
-- Use a rota POST /api/auth/seed-admin (se disponivel) ou insira via API:

-- Via psql (apenas para inicializacao; preferir a API em seguida)
INSERT INTO usuarios (
    tenant_id,
    email,
    nome,
    role,
    ativo
) SELECT
    id,
    'admin@exemplolandia.lidera.app.br',
    'Administrador',
    'admin',
    true
FROM tenants WHERE slug = 'exemplolandia'
RETURNING id, email, role;
```

Em seguida, acesse `https://exemplolandia.lidera.app.br/admin` e complete o fluxo de criacao de senha pelo portal.

### 9.3 Smoke test completo

```powershell
# 1. Readiness da API (deve retornar HTTP 200)
$res = Invoke-WebRequest -Uri "http://localhost:3001/api/health/ready" `
    -UseBasicParsing
Write-Host "API status: $($res.StatusCode)"
# Esperado: 200

# 2. Portal web respondendo
$web = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing
Write-Host "Web status: $($web.StatusCode)"
# Esperado: 200

# 3. Nginx roteando corretamente (requer DNS local ou header Host manual)
$nginx = Invoke-WebRequest -Uri "http://localhost/api/health/ready" `
    -Headers @{ "Host" = "exemplolandia.lidera.app.br" } -UseBasicParsing
Write-Host "Nginx -> API status: $($nginx.StatusCode)"
# Esperado: 200
```

```bash
# Dentro do Ubuntu/WSL2
# Testar a cadeia completa API -> Postgres -> Redis
curl -s http://localhost:3001/api/health/ready | python3 -m json.tool

# Testar isolamento RLS: conectar como portal_app sem tenant setado
docker exec portal-postgres psql -U portal_app -d portal \
    -c "SELECT COUNT(*) FROM tenants;"
# Deve retornar 0 (RLS ativo — portal_app nao ve dados sem contexto de tenant)
```

---

## 10. Operacao: Backup, Logs, Auto-start e Atualizacao

### 10.1 Backup do banco de dados

```bash
# Script em /home/lidera/scripts/backup-portal-pg.sh (Ubuntu/WSL2)
# Ver detalhes completos em docs/operacao/backup-restore-runbook.md

#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="/home/lidera/backups/postgres"
DATE=$(date +%Y%m%d)
mkdir -p "$BACKUP_DIR/daily"

docker exec portal-postgres pg_dump \
    -U postgres -d portal -Fc \
    -f /tmp/portal_backup.dump

docker cp portal-postgres:/tmp/portal_backup.dump \
    "$BACKUP_DIR/daily/portal_${DATE}.dump"

# Criptografar (frase em /home/lidera/.backup-passphrase, modo 600)
gpg --batch --yes --symmetric \
    --passphrase-file /home/lidera/.backup-passphrase \
    --cipher-algo AES256 \
    --output "$BACKUP_DIR/daily/portal_${DATE}.dump.gpg" \
    "$BACKUP_DIR/daily/portal_${DATE}.dump"

rm "$BACKUP_DIR/daily/portal_${DATE}.dump"
echo "Backup: $BACKUP_DIR/daily/portal_${DATE}.dump.gpg"
```

```bash
# Agendar via cron (dentro do Ubuntu com systemd habilitado)
crontab -e
# Adicionar:
# 0 2 * * * /home/lidera/scripts/backup-portal-pg.sh >> /home/lidera/logs/backup.log 2>&1
```

**No PowerShell (Abordagem 2 — Windows nativo):**

```powershell
# Backup via pg_dump nativo
$date   = Get-Date -Format "yyyyMMdd"
$dest   = "D:\Backups\portal_${date}.dump"
$pgdump = "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"

& $pgdump --username=postgres --host=localhost --dbname=portal `
    --format=custom --no-acl --file=$dest

Write-Host "Backup gerado: $dest"

# Agendar com Task Scheduler
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NonInteractive -File D:\Scripts\backup-portal.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"
Register-ScheduledTask -TaskName "Portal-Backup-PG" `
    -Action $action -Trigger $trigger -User "SYSTEM" -Force
```

### 10.2 Logs

```bash
# Docker (Abordagem 1)
# Logs em tempo real de todos os servicos
docker compose -f docker-compose.prod.yml logs -f

# Logs de um servico especifico com timestamp
docker compose -f docker-compose.prod.yml logs --timestamps portal-api | tail -200

# Logs persistentes (se configurado com driver json-file ou loki)
docker inspect portal-api | grep LogPath
```

```powershell
# Nginx para Windows
Get-Content "C:\nginx\logs\prefeitura-access.log" -Tail 50 -Wait

# Servicos NSSM (Abordagem 2)
Get-Content "D:\Site\portal-prefeitura\logs\api-stderr.log" -Tail 100 -Wait
```

### 10.3 Auto-start

**Abordagem 1 (Docker em WSL2):** todos os containers tem `restart: always`. O WSL2 inicia via Tarefa Agendada configurada na secao 3.4. Verificar:

```powershell
Get-ScheduledTask -TaskName "Portal-Prefeitura-WSL-Start" | Select-Object TaskName, State
```

**Abordagem 2 (Windows nativo):** os servicos NSSM tem `Start SERVICE_AUTO_START`. Verificar:

```powershell
Get-Service portal-api, portal-web, portal-minio, nginx, Memurai |
    Select-Object Name, Status, StartType
```

### 10.4 Atualizar o portal para uma nova versao

```bash
# Dentro do Ubuntu/WSL2 (Abordagem 1)
cd /home/lidera/portal

# Buscar atualizacoes
git fetch origin
git pull origin main     # ou a branch de producao

# Reconstruir imagens com as alteracoes
docker compose -f docker-compose.prod.yml --env-file portal.env build

# Reiniciar os servicos com zero-downtime (substitui containers um a um)
docker compose -f docker-compose.prod.yml --env-file portal.env up -d

# Se houver novas migrations (verificar git log db/)
# As migrations novas nao rodam automaticamente apos a primeira subida.
# Execute manualmente:
for f in db/*.sql; do
    echo "Checando $f ..."
    psql "$DATABASE_URL" -f "$f" 2>&1 | grep -v "already exists" || true
done

# Verificar saude apos atualizacao
docker compose -f docker-compose.prod.yml ps
curl -s http://localhost:3001/api/health/ready
```

---

## 11. Troubleshooting

### Erro: "extension postgis does not exist"

A imagem `postgres:16-alpine` padrao nao inclui PostGIS. Confirme que esta usando `postgis/postgis:16-3.4`:

```bash
docker exec portal-postgres psql -U postgres -c "SELECT PostGIS_Version();"
# Deve retornar a versao, ex: "3.4 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"
```

Se retornar erro, a imagem errada foi usada. Remova o container, corrija o `docker-compose.prod.yml` e suba novamente (os dados em volumes Docker sao preservados).

### Erro: "RLS policies not applied" ou dados de outros tenants visiveis

A causa mais comum e a API conectando como superusuario. Verifique:

```bash
# Inspecionar DATABASE_URL nos logs do container
docker exec portal-api env | grep DATABASE_URL
# Deve conter "portal_app", NUNCA "postgres"
```

Se contiver `postgres`, corrija o `portal.env` e reinicie o container:

```bash
docker compose -f docker-compose.prod.yml restart portal-api
```

### Erro: "MaxRetriesPerRequest" no Redis / filas nao processam

A conexao BullMQ exige `maxRetriesPerRequest: null` e `enableReadyCheck: false`. Se a API logar erros de timeout no Redis, verifique que o `REDIS_HOST`, `REDIS_PORT` e `REDIS_PASSWORD` estao corretos:

```bash
docker exec portal-api sh -c \
    "node -e \"const r=require('ioredis');const c=new r({host:'$REDIS_HOST',port:$REDIS_PORT,password:'$REDIS_PASSWORD'});c.ping().then(console.log).catch(console.error)\""
# Deve imprimir: PONG
```

### Porta 3001 ou 3000 ja ocupada

```powershell
# Identificar qual processo usa a porta
netstat -ano | Select-String ":3001"
# Ou
Get-NetTCPConnection -LocalPort 3001 | Select-Object LocalAddress, LocalPort, OwningProcess |
    ForEach-Object { $_ | Add-Member -NotePropertyName ProcessName `
        -NotePropertyValue (Get-Process -Id $_.OwningProcess).Name -PassThru }
```

```bash
# No Ubuntu/WSL2
ss -tulnp | grep -E '3000|3001'
```

### Erro de CRLF em scripts bash (Windows)

Ao editar scripts `.sh` no Windows e executar no Linux/WSL2, os caracteres de fim de linha `\r\n` causam erros:

```bash
# Corrigir CRLF para LF em todos os scripts
find /home/lidera/portal -name "*.sh" -exec sed -i 's/\r$//' {} +

# Ou converter um arquivo especifico
sed -i 's/\r$//' /home/lidera/scripts/backup-portal-pg.sh
```

Configure o Git para nao converter fim de linha:

```bash
# Dentro do Ubuntu
git config --global core.autocrlf false
git config --global core.eol lf
```

```powershell
# No Windows (para o repositorio)
git config core.autocrlf false
```

### Container portal-postgres nao sobe apos reinicio

Verifique o log do container:

```bash
docker logs portal-postgres --tail 50
```

Causas comuns:
- Volume corrompido: use `docker volume inspect portal_pg_data` e verifique espaco em disco.
- Versao incompativel do volume: se trocou de `postgres:16` para `postgis/postgis:16-3.4`, o formato interno pode ser diferente. Faca backup antes de recriar o volume.

### Nginx nao encontra os arquivos de site

No Windows, o include de arquivos `.conf` no Nginx pode falhar se o diretorio `sites/` nao existir:

```powershell
# Criar diretorio e verificar o include no nginx.conf
New-Item -ItemType Directory -Force -Path "C:\nginx\conf\sites"
C:\nginx\nginx.exe -t
# Deve retornar: configuration file C:/nginx/conf/nginx.conf test is successful
```

---

## 12. Checklist Final de Seguranca

Antes de apontar o DNS de producao para o servidor, confirme cada item:

```
SEGREDOS E CREDENCIAIS
[ ] Nenhum segredo real no repositorio git (verificar: git log -p | grep -E "password|secret|key" )
[ ] portal.env com permissao 600 (Linux) ou ACL restrita (Windows), fora do git
[ ] AUTH_JWT_SECRET >= 32 chars, gerado com openssl rand (nao reutilizado de outro projeto)
[ ] CPF_PEPPER gerado com openssl rand -hex 32 e armazenado em cofre
[ ] Senhas de banco (portal_app, portal_ro, postgres root) distintas e fortes
[ ] Credenciais MinIO distintas das do PostgreSQL
[ ] Chaves de API externas (Anthropic, Voyage, Z-API, gov.br) em cofre, nao no git
[ ] Backup cifrado do portal.env com GPG configurado e testado

BANCO DE DADOS / RLS
[ ] API conecta como portal_app (NOSUPERUSER NOBYPASSRLS), nunca como postgres
[ ] Papel portal_ro criado e usado apenas por relatorios/MCP
[ ] RLS habilitado: SELECT rowsecurity FROM pg_tables WHERE rowsecurity = true retorna as tabelas de tenant
[ ] PostGIS habilitado: SELECT PostGIS_Version() retorna versao
[ ] 62 migrations rodadas em ordem (001..062) sem erro

REDE E TLS
[ ] API nao acessivel diretamente pela internet (apenas via Nginx + Cloudflare)
[ ] Portas de banco (5432, 6432), Redis (6379), MinIO (9000, 9001) e n8n (5678) NAO abertas para internet
[ ] TLS ativo na borda Cloudflare para todos os dominios de prefeitura
[ ] Nginx configurado com vhost curinga e headers X-Forwarded-Proto https
[ ] cloudflared rodando e tunel ativo (cloudflared tunnel info)
[ ] ALLOWED_ORIGINS configurado com os dominios reais das prefeituras (sem * em producao)

OPERACAO
[ ] Auto-start configurado e testado (reiniciar servidor e verificar que os containers/servicos sobem)
[ ] Backup diario agendado e testado (executar manualmente e verificar o arquivo gerado)
[ ] Restore testado pelo menos uma vez em container de teste isolado
[ ] Logs de acesso e erro do Nginx configurados e rotacionados
[ ] Smoke test OK: GET /api/health/ready retorna 200
[ ] Primeiro tenant e admin criados e login testado pelo portal web

ACESSIBILIDADE E LGPD
[ ] Tema do tenant com contraste WCAG AA (ferramenta: https://webaim.org/resources/contrastchecker)
[ ] VLibras carregado no portal publico (verificar no HTML da home)
[ ] Politica de privacidade e aviso de cookies configurados no tenant
[ ] Logs de acesso a dados pessoais gravando em audit_log (verificar apos login e acesso a manifestacao)
```

---

*Documento mantido em `docs/instalacao/01-windows-server.md`. Atualize junto com mudancas de infra ou stack.*
