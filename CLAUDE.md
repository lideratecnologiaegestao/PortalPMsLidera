# CLAUDE.md — Contexto do Projeto

> Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
> Ele define **como** trabalhar neste repositório. Leia também os docs e specs apontados abaixo antes de implementar qualquer módulo.

## O que é

Plataforma **SaaS multi-tenant** que serve N prefeituras a partir de um único código e uma única infraestrutura. Cada prefeitura (tenant) tem domínio, identidade visual e conteúdo próprios. O produto cobre ESIC, Ouvidoria, Transparência, Diário Oficial, Serviços, CMS dinâmico, App do Cidadão (denúncias georreferenciadas) e camada de IA.

## Stack

- **API:** NestJS 10 (monólito modular) + Prisma + PostgreSQL 16 + PostGIS
- **Filas:** BullMQ 5 + Redis 7 (`ioredis`)
- **Portal:** Next.js 14 (App Router, SSR/ISR)
- **Mobile:** React Native + Expo
- **Integrações/ETL:** n8n
- **Infra:** Docker, Kubernetes, GitHub Actions
- **IA:** API Anthropic (triagem, RAG, chatbot, OCR)

> **Infra alvo (produção):** Servidor Lidera (Docker em WSL2). Reusa Redis e Evolution API (WhatsApp) já existentes; o portal provisiona seu próprio Postgres com PostGIS e storage (MinIO). Exposição via Nginx + Cloudflare Zero Trust. Detalhes e pegadinhas (superusuário x RLS, PostGIS, storage via backend) em `docs/12-infraestrutura.md`.

## Regras invioláveis (NUNCA quebrar)

1. **Isolamento por RLS.** Toda tabela com dados de tenant tem `tenant_id` e policy de Row Level Security. O acesso passa pelo `PrismaService` (que seta `app.current_tenant_id` na transação). **Nunca** desabilite RLS nem consulte cross-tenant fora de `prisma.platform()`.
2. **Duas camadas de segurança.** RBAC (`@Roles` + `RolesGuard`) controla *o que pode fazer*; RLS controla *o que pode ver*. As duas são obrigatórias e independentes.
   **2b. Fronteira de camadas (gateway único).** Frontend e App falam **somente** com o backend (API). O frontend/app **nunca** acessa banco, storage, filas, plugins ou APIs externas — só o backend faz isso. Toda foto/arquivo sobe **via API** (multipart), e a API grava no storage. Não existe URL assinada de upload nem cliente de banco/storage no web/mobile.
3. **Acessibilidade é lei.** Tema reprovado no contraste WCAG AA **não salva**. O portal carrega VLibras e segue o Design System gov.br.
4. **Prazos legais.** ESIC = 20+10 dias (LAI 12.527/2011); Ouvidoria = 30+30 (Lei 13.460/2017). A FSM e o SLA worker garantem alerta e vencimento. Não altere prazos sem ADR.
5. **LGPD/GDPR.** Minimização de dados, base legal por finalidade, logs de acesso a dados pessoais, anonimização de denúncias. Ver `docs/06-lgpd-gdpr.md`.
6. **Auditoria.** Toda ação sensível e toda falha de worker (dead-letter) gravam em `audit_log`.
7. **Filas.** Conexão Redis com `maxRetriesPerRequest: null` e `enableReadyCheck: false`. Idempotência por `jobId`. Nomes sempre via constantes em `queue.constants.ts`.

## Comandos

```bash
docker compose up -d                      # sobe db+redis+n8n+api+web
cd api && npm run start:dev               # API em watch
cd api && npm run prisma:generate         # regenera o client após mudar schema
for f in db/*.sql; do psql "$DATABASE_URL" -f "$f"; done   # migrations (RLS)
cd web && npm run dev                      # portal
```

## Fluxo de trabalho esperado do Claude Code

1. **Antes de codar:** leia a spec do módulo em `specs/` e os docs relevantes em `docs/`.
2. **Delegue** para o subagent certo (`.claude/agents/`): backend, frontend, mobile, DBA/RLS, segurança, LGPD, QA, revisor.
3. **Use as skills** (`.claude/skills/`) para padrões recorrentes (RLS, FSM/SLA, tema/WCAG, gov.br, transparência).
4. **Migrations primeiro:** mudança de dados começa por `db/*.sql` (fonte da verdade do RLS), depois `prisma db pull`.
5. **Testes** acompanham a feature (unit + e2e). Nada de PR sem teste de RLS quando há tabela nova.
6. **Auditoria de segurança** antes de fechar feature sensível (`/auditoria-seguranca`).
7. **Commits** em Conventional Commits; PR com o template; CI verde (lint, test, SAST, RLS-check).

## Mapa do repositório

```
db/            migrations SQL — fonte da verdade do RLS
api/           NestJS (common/tenant, common/rbac, prisma, modules/*)
web/           Next.js (tema dinâmico por tenant)
mobile/        Expo (a criar — ver specs/app-cidadao.md)
docs/          arquitetura, requisitos, segurança, devsecops, LGPD/GDPR, banco, mobile, escalabilidade, stack, roadmap, ADRs
specs/         specs por módulo (contrato que os agents implementam)
infra/         k8s + observabilidade
.claude/       agents, skills, commands (orquestração do Claude Code)
.mcp.json      MCP: postgres, filesystem, git, fetch, playwright
```

## Definição de pronto (DoD)

Uma feature está pronta quando: spec atendida · testes passando (incl. teste de isolamento RLS) · acessibilidade verificada quando há UI · base legal LGPD documentada quando há dado pessoal · auditoria registrada nas ações sensíveis · docs/spec atualizados · CI verde.

## Roadmap resumido

Ver `docs/11-roadmap.md`. Ordem das fases: **Fundação** (feito: RLS + núcleo + tema + ESIC/Ouvidoria) → **Transparência** → **Serviços + CMS** → **App do Cidadão** → **Diário Oficial** → **IA** → **Escala/Multi-região**.
