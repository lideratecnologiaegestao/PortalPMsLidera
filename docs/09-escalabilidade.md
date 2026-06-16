# 09 — Escalabilidade

## Padrões de carga

- **Picos previsíveis:** prazos legais (fim de mês), publicação de transparência, editais, calamidades (app de chamados dispara).
- **Leitura >> escrita** no público (transparência, serviços, notícias) — cacheável.
- **Escrita concentrada** em manifestações e chamados.

## Estratégia

| Camada | Como escala |
|--------|-------------|
| Web (Next.js) | Stateless, horizontal; **ISR + CDN**; cache por tenant (tags `tenant:<host>`) |
| API (NestJS) | Stateless, horizontal atrás de load balancer; autoscaling por CPU/latência |
| Workers (BullMQ) | Escala por concorrência e nº de réplicas; filas absorvem picos |
| PostgreSQL | Vertical + **réplicas de leitura** para relatórios/transparência; pool (PgBouncer) |
| Redis | Cluster/replica; usado para filas e cache |
| Object storage | Elástico por natureza |

## Multi-tenancy e escala

- Default: shared schema + RLS. Custo de RLS amortizado por **cache/ISR** no read-heavy.
- **Tenant "barulhento":** isolar com limites por tenant (rate limit, cota de fila) para evitar que um município degrade os outros.
- **Capital de grande porte:** promover a **schema dedicado** (ou banco dedicado) sem mudar a aplicação. Decisão por ADR e gatilho de volume.

## Banco

- Pooling de conexões (cada query RLS é uma transação curta → pooling é essencial).
- Índices compostos por `tenant_id`; particionamento por tempo/tenant em tabelas de altíssimo volume (logs, transparência).
- Réplica de leitura para a API pública de dados abertos.

## Caching

- ISR no Next.js para páginas públicas; invalidação por tag quando o tenant publica.
- Cache de tokens de tema e de resolução de tenant (host → tenant) com TTL.
- Cache de respostas de transparência (dado público, mudança previsível).

## Multi-região (fase futura)

- CDN global para estático/ISR.
- Banco primário por região + réplicas; estratégia de residência de dados (dados públicos vs. pessoais).
- Latência de escrita tolerável (manifestações não são tempo real).

## Capacidade & custo

- Métricas-guia: req/s por tenant, profundidade de fila, p95 de latência, cache hit, conexões de banco.
- Autoscaling com limites; orçamento de custo por ambiente; alarmes de anomalia.
- Teste de carga (k6) nos endpoints públicos e no registro de manifestação a cada release relevante.
