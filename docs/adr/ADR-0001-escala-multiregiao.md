# ADR-0001 — Estratégia de Escala e Multi-região

- **Status:** Aceito
- **Data:** 2026-06-02
- **Decisores:** Arquitetura
- **Relacionado a:** `docs/09-escalabilidade.md`, `docs/12-infraestrutura.md`, `infra/k8s/`

---

## Contexto

A plataforma está no estágio final do roadmap (Fase Escala/Multi-região), operando hoje em **produção single-node** no Servidor Lidera (Windows Server 2022, Docker em WSL2). Os módulos implementados — ESIC/Ouvidoria, Transparência, CMS, Chamados/PostGIS, Diário Oficial, IA — estão prontos. O banco é Postgres 16/PostGIS com shared schema + RLS; workers BullMQ; o portal Next.js usa ISR; a resolução de tenant (Host → tenantId) era feita por Map em memória no `TenantMiddleware`.

Decidir, com gatilhos e trade-offs explícitos: (1) escala do Postgres multi-tenant; (2) camadas de cache; (3) observabilidade; (4) escala de workers BullMQ; (5) object storage; (6) topologia multi-região e migração para Kubernetes.

**Princípio guia:** decisões baratas e de alto valor são implementadas agora; decisões caras ou irreversíveis ficam condicionadas a gatilhos mensuráveis.

---

## Decisão

### 1. Postgres: pooling, read replicas e promoção de capitais (3 níveis em cascata)

- **Nível 1 — Agora:** **PgBouncer em transaction pooling** na frente do `portal-postgres`. O `PrismaService` já usa `set_config('app.current_tenant_id', $1, true)` dentro de `BEGIN/COMMIT` — exatamente o padrão compatível com transaction pooling. Reduz conexões de N-workers×concorrência para um pool fixo. Restrição: prepared statements nomeados, `LISTEN/NOTIFY` e advisory locks de sessão são incompatíveis — nenhum é usado.
- **Nível 2 — Gatilho: p95 leitura > 300 ms ou CPU Postgres > 70% por 10 min:** **réplica de leitura** (streaming replication). `DATABASE_URL_READONLY` (já prevista) roteia leituras públicas (transparência, ISR, dados abertos). RLS funciona na réplica (GUC local à transação).
- **Nível 3 — Gatilho: tenant > 500k registros em tabela de alta frequência ou SLA > 1 s com réplica:** promover para **schema/instância dedicada** (`tenants.db_url`), sem mudança de aplicação.

Não fazer agora: Citus/sharding horizontal (complexidade prematura), instância por tenant para todos.

### 2. Camadas de cache

- **A — Cache de tenant em Redis (agora):** o `Map` em memória quebra em multi-instância. Migrar para Redis TTL 300 s (`portal:tenant:host:<host>`), invalidação no save. Pré-requisito para escalar a API horizontalmente.
- **B — Cache de tema em Redis (agora):** tokens JSONB lidos a cada request → Redis TTL 600 s.
- **C — ISR Next com invalidação por evento:** `revalidateTag` via backend ao publicar CMS/transparência/diário.
- **D — CDN Cloudflare (agora, config):** dados abertos com `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`; PDFs de diário `max-age=31536000, immutable`. Anexos privados nunca recebem cache público.

Não fazer agora: Redis Cluster (abaixo de 10 GB), reverse proxy de cache adicional.

### 3. Observabilidade — OpenTelemetry → Prometheus/Grafana/Loki/Tempo (self-hosted)

- **Agora:** logs JSON estruturados (`tenant_id`, `request_id`, `user_id` UUID, `module`, `action`, `duration_ms`, `status_code` — nunca CPF/nome/conteúdo); **health/readiness probes** (`/api/health`, `/api/health/ready` checando Postgres+Redis); **métricas Prometheus** (`/api/metrics`); alerta de SLA legal a vencer.
- **Quando escalar:** OTel SDK com `tenant_id` nos traces; stack Grafana completa com dashboards por tenant.
- Retenção de logs 90 dias + 5 anos frio. Base legal: legítimo interesse (LGPD art. 7º IX). Nunca dado pessoal em claro.

### 4. Workers BullMQ — filas dedicadas (resolve a contenção atual)

Problema: múltiplos workers numa fila genérica fazem jobs lentos (IA/OCR) bloquearem urgentes (SLA). **Agora:** 6 filas dedicadas (`notificacoes`, `sla`, `transparencia`, `ia`, `integracoes`, `expurgo`), concorrência por característica, nomes em `queue.constants.ts`. Idempotência por `jobId` composto. Dead-letter em `audit_log`. **Quando escalar:** containers de worker por tipo de fila.

### 5. Object storage — MinIO single-node → S3/R2

**Agora:** versionamento nos buckets `portal-diario`/`portal-manifestacoes`; retenção por bucket; backup diário offsite (`mc mirror`). Entrega sempre via stream do backend (regra 2b); PDFs públicos cacheados na CDN. **Gatilhos para migrar (S3/R2):** volume > 500 GB, SLA > 99,9%, multi-região. Migração = troca de env no `StorageService`. LGPD: região `sa-east-1`/jurisdição BR e DPA antes de migrar dados pessoais (art. 33).

### 6. Multi-região e Kubernetes — ativo-passivo, k8s condicional

- **Ativo-passivo** inter-região (primário de escrita + réplica de leitura na 2ª região). Ativo-ativo rejeitado: complexidade de conflitos não se justifica; manifestações/chamados toleram 50–150 ms de latência de escrita.
- **Roteamento por domínio** no Cloudflare Load Balancing — `TenantMiddleware` resolve por Host sem mudança.
- **Kubernetes é condicional, não programado.** Os manifestos em `infra/k8s/` são aspiracionais. Gatilhos: CPU API > 70% por 1h após scale vertical; 3+ serviços escalando em ritmos distintos; SLA contratual < 99,5%; equipe com capacidade de operar k8s. Antes disso, o caminho barato é **Nginx upstream com 2–3 instâncias da API** em Docker Compose, Redis Sentinel e Patroni se HA for necessário — tudo sem k8s.

---

## Alternativas consideradas (resumo)

1. **Citus** — rejeitado (RLS/PostGIS cross-shard, complexidade); só > 1 TB transacional.
2. **Redis Cluster** — rejeitado; Sentinel (HA sem sharding) é suficiente.
3. **Observabilidade SaaS** (Datadog/Grafana Cloud) — alternativa válida; preferido self-hosted por custo e controle de dados (LGPD).
4. **Cloudflare R2 imediato** — rejeitado agora; MinIO tem custo zero e latência interna mínima.
5. **Ativo-ativo desde o início** — rejeitado; ativo-passivo atende 99,9% com fração da complexidade.
6. **k8s imediato** — rejeitado; Docker Compose multi-instância cobre até os gatilhos.

---

## Consequências

**Positivas:** escala incremental sem reescrever a aplicação; cache de tenant em Redis destrava multi-instância; filas dedicadas eliminam contenção; observabilidade mínima em horas; caminho claro para multi-região.

**Negativas / mitigações:** PgBouncer transaction pooling exige disciplina (teste de RLS no CI); cache de tenant tem eventual consistency de até 5 min (invalidação explícita); 6 filas aumentam configuração (centralizada em `queue.constants.ts`); logs sem PII exigem lint rule; MinIO single-node sem HA (backup offsite + gatilho de migração).

**Segurança:** TLS entre serviços em multi-host (`sslmode=require`, `tls` no ioredis); Redis com `requirepass` e DB dedicado; Grafana/Loki com SSO e acesso restrito a `tenant_id`.

**LGPD:** logs com pseudônimos (UUID) apenas; métricas por tenant não expõem PII; storage externo exige região BR/UE + DPA (art. 33).

---

## Checklist acionável

### Agora (alto valor, custo baixo)
- [ ] PgBouncer (transaction pooling) + teste de RLS no CI.
- [ ] Cache de resolução de tenant em Redis (TTL 300 s) + invalidação no save. _(substitui o Map em memória do middleware)_
- [ ] Cache de tema em Redis (TTL 600 s).
- [ ] 6 filas BullMQ dedicadas em `queue.constants.ts` + idempotência por `jobId` composto.
- [ ] Logs JSON estruturados + lint rule contra `console.log`.
- [x] **Health/readiness probes** (`/api/health`, `/api/health/ready`) — *implementado*.
- [x] **Endpoint Prometheus** (`/api/metrics`) — *implementado*.
- [ ] `HEALTHCHECK` no `docker-compose.yml`.
- [ ] Versionamento + retenção dos buckets MinIO; backup diário offsite.
- [ ] `Cache-Control` nos dados abertos/PDFs + Cache Rule no Cloudflare.
- [ ] Job diário de alerta de SLA legal a vencer.

### Quando escalar (gatilho mensurável)
- [ ] Read replica (p95 > 300 ms / CPU > 70%).
- [ ] Workers dedicados por tipo de fila.
- [ ] Schema dedicado para capital (> 500k linhas / SLA > 1 s).
- [ ] OTel SDK completo + Grafana stack (multi-instância).
- [ ] MinIO → S3/R2 (> 500 GB / SLA > 99,9%) + DPA.
- [ ] TLS interno (Postgres/Redis em host distinto).
- [ ] Redis Sentinel (Redis vira SPOF).
- [ ] Multi-região ativo-passivo (SLA < 99,5% / DR geográfico).
- [ ] Kubernetes (CPU > 70%/1h, 3+ serviços, SLA contratual, equipe de infra).

---

*Revisitar quando: tenants > 100, volume mensal de dados abertos > 50 GB, SLA contratual < 99,5%, ou novo módulo introduzir padrão de acesso incompatível.*
