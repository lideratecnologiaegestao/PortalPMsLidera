# Manual de Instalação — Portal de Prefeitura

Guia único para instalar e operar a plataforma **SaaS multi-tenant** (NestJS + Next.js + PostgreSQL/PostGIS + Redis/BullMQ + n8n + MinIO/S3) em qualquer ambiente. Cada manual é copia-e-cola, do zero ao smoke test.

> **Antes de tudo, leia:** [`../12-infraestrutura.md`](../12-infraestrutura.md) (topologia, o que reusar/provisionar) e as **regras invioláveis** em [`../../CLAUDE.md`](../../CLAUDE.md). O segredo do produto está no isolamento por **RLS** — não o quebre (ver abaixo).

## Escolha o ambiente

| # | Ambiente | Quando usar | Manual |
|---|----------|-------------|--------|
| 1 | **Windows Server** (2019/2022) | Servidor on-premises Windows (ex.: Servidor Lidera). Docker em WSL2 (recomendado) ou nativo | [01-windows-server.md](01-windows-server.md) |
| 2 | **Linux** (Ubuntu/Debian) | VM ou bare-metal Linux. Docker Compose (recomendado) ou nativo com systemd | [02-linux.md](02-linux.md) |
| 3 | **Docker / Docker Compose** | Qualquer host com Docker; é a base de dev e de produção on-premises | [03-docker.md](03-docker.md) |
| 4 | **Google Cloud (GCP)** | Nuvem gerenciada: Cloud Run + Cloud SQL + Memorystore + GCS | [04-gcp.md](04-gcp.md) + [Terraform](../../infra/terraform/gcp/) |
| 5 | **Amazon Web Services (AWS)** | Nuvem gerenciada: ECS Fargate + RDS + ElastiCache + S3 | [05-aws.md](05-aws.md) + [Terraform](../../infra/terraform/aws/) |

Para as nuvens há **Terraform** pronto que provisiona toda a infra: [`infra/terraform/gcp/`](../../infra/terraform/gcp/) e [`infra/terraform/aws/`](../../infra/terraform/aws/). Cada pasta tem seu `README.md` com `init/plan/apply` e como popular os segredos no secret manager.

## Componentes e portas (vale para todos os ambientes)

| Componente | Imagem/serviço | Porta | Papel |
|-----------|----------------|-------|-------|
| Banco | `postgis/postgis:16-3.4` (ou Cloud SQL / RDS PG 16) | 5432 | Dados multi-tenant + PostGIS + **RLS** |
| Pooler | `edoburu/pgbouncer` (opcional, recomendado em prod) | 6432 | Transaction pooling (API usa `?pgbouncer=true`) |
| Cache/Filas | `redis:7` (ou Memorystore / ElastiCache) | 6379 | BullMQ (`BULLMQ_PREFIX=portal`, `REDIS_DB=1`) |
| Object storage | MinIO (ou GCS interop S3 / S3 nativo) | 9000 / 9001 | Anexos, fotos de chamados, Diário. Bucket `portal` |
| ETL | `n8n` | 5678 | Integração com sistemas contábeis (Transparência) |
| **API** | NestJS (`./api`) | **3001** | Base path `/api`; readiness `GET /api/health/ready` |
| **Web** | Next.js 14 standalone (`./web`) | **3000** | Portal SSR/ISR; resolve o tenant pelo **Host** |
| Antivírus (opcional) | ClamAV daemon | 3310 | Varredura de uploads |

## As 3 coisas que você NÃO pode errar

1. **⚠️ Nunca conecte a API como superusuário do PostgreSQL.** Um superusuário **ignora todas as policies de RLS** e quebra o isolamento entre prefeituras. A API usa o papel **`portal_app`** (`NOSUPERUSER NOBYPASSRLS`); crie também **`portal_ro`** (somente `SELECT`) para relatórios/MCP. Nas nuvens, o usuário "admin" do Cloud SQL/RDS **não** é superusuário PG real — isso *preserva* o RLS, mas mesmo assim crie os papéis dedicados.
2. **⚠️ Segredos nunca no Git.** `AUTH_JWT_SECRET` (≥32 chars), `CPF_PEPPER` (`openssl rand -hex 32`), senhas de banco e chaves de storage/IA ficam em **cofre / Secret Manager / Secrets Manager**, injetados como variáveis de ambiente. O repositório só versiona [`.env.example`](../../.env.example) (template) e [`.env.prod.example`](../../.env.prod.example) — ambos só com placeholders.
3. **⚠️ Nada aberto direto à internet.** Web e API ficam atrás de **Nginx/ALB/Load Balancer + WAF/Cloudflare**, com **TLS obrigatório**. O frontend e o app falam **somente** com a API (gateway único) — nunca com banco, storage ou filas.

## Banco de dados: migrations

As migrations são a **fonte da verdade do RLS** e ficam em [`../../db/`](../../db/) — **62 arquivos** (`001_*.sql` … `062_*.sql`), aplicados em **ordem alfabética**.

- No **Docker**, rodam automaticamente na 1ª subida do container Postgres (montadas em `/docker-entrypoint-initdb.d`).
- **Manualmente** (qualquer ambiente):
  ```bash
  for f in db/*.sql; do psql "$DATABASE_URL" -f "$f"; done
  ```
- A pasta [`../../db/optional/`](../../db/) (pgvector / embeddings) é **opcional** — só é necessária para a busca semântica da IA.

## Fluxo comum (qualquer ambiente)

1. Provisionar banco (PostGIS), Redis e object storage.
2. Criar papéis `portal_app` / `portal_ro` e habilitar `CREATE EXTENSION postgis`.
3. Configurar variáveis de ambiente a partir de [`.env.example`](../../.env.example) (segredos no cofre).
4. Aplicar as 62 migrations `db/*.sql`.
5. Build/deploy das imagens `./api` e `./web`.
6. Publicar atrás de proxy/WAF com TLS; configurar o **Host curinga** (multi-tenant).
7. Seed do **tenant inicial + admin**; **smoke test**: `curl -f https://<host>/api/health/ready` → `200`.
8. Cadastrar a prefeitura no Gerenciador (super_admin) — novos tenants entram pelo Host sem mexer em infra.

## Pós-instalação e operação

Cada manual traz seções de **pós-instalação** (criar tenant/admin, smoke test), **operação** (backup com `pg_dump`, logs, atualização) e **troubleshooting**. Runbooks transversais:

- Backup & restore: [`../operacao/backup-restore-runbook.md`](../operacao/backup-restore-runbook.md)
- Borda / Cloudflare / WAF / geo: [`../operacao/borda-cloudflare-waf-geo.md`](../operacao/borda-cloudflare-waf-geo.md)
