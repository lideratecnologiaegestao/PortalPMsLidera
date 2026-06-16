# 10 — Stack Tecnológica

| Camada | Tecnologia | Por quê |
|--------|------------|---------|
| API | **NestJS 10** (TypeScript) | Estrutura modular, DI, guards/middleware — encaixa multi-tenant + RBAC |
| ORM | **Prisma** | DX forte; RLS fica no SQL e o `PrismaService` faz a ponte |
| Banco | **PostgreSQL 16 + PostGIS** | RLS nativo (isolamento de tenant) e geo (chamados) |
| Filas | **BullMQ 5 + Redis 7** (`ioredis`) | SLA, notificações, ETL assíncrono; idempotência por jobId |
| Portal | **Next.js 14** (App Router) | SSR/ISR, tema por tenant via CSS vars, SEO, acessibilidade |
| Estilo | **Tailwind** (CSS vars) | Um build, N identidades visuais |
| Mobile | **React Native + Expo** | App do Cidadão multiplataforma, EAS Build |
| Integrações/ETL | **n8n** | Isola a integração heterogênea com sistemas contábeis |
| Validação | **Zod / class-validator** | Contratos de entrada seguros |
| Datas | **date-fns / date-fns-tz** | Cálculo de prazos (dias úteis/corridos, feriados) |
| IA | **API Anthropic** | Triagem de manifestações, RAG, chatbot, OCR |
| Infra | **Docker + Kubernetes** | Portabilidade e escala horizontal |
| CI/CD | **GitHub Actions** | Pipelines de build, teste, segurança e deploy |
| Observabilidade | **OpenTelemetry + Prometheus + Grafana** | Logs/métricas/tracing |
| Identidade | **gov.br Login Único (OIDC)** | Identidade oficial do cidadão |
| Assinatura | **ICP-Brasil** | Validade jurídica do Diário Oficial |

## Critérios de escolha

- **Padrão sobre exceção:** tecnologias maduras e amplamente conhecidas, para que qualquer dev (e o Claude Code) seja produtivo.
- **TypeScript ponta a ponta:** API, web e mobile compartilham linguagem e tipos.
- **Conformidade embutida:** Postgres/RLS para isolamento, ICP-Brasil para Diário, gov.br para identidade.
- **Portabilidade:** sem amarração a um provedor além de object storage e API de IA (ambos substituíveis).

## Versões de referência

Ver `api/package.json` e `web/package.json`. Dependências fixadas; atualização via PR com SCA verde.
