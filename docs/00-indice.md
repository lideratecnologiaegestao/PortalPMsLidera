# Documentação — Portal de Prefeitura

Documentação viva do projeto. Acompanha o código no mesmo PR.

| Doc | Conteúdo |
|-----|----------|
| [01 — Arquitetura](01-arquitetura.md) | Visão, componentes, multi-tenancy, decisões |
| [02 — Requisitos](02-requisitos.md) | Funcionais (por módulo) e não-funcionais |
| [03 — Fluxos](03-fluxos.md) | Diagramas dos principais fluxos (Mermaid) |
| [04 — Segurança](04-seguranca.md) | Modelo de ameaças, AuthN/AuthZ, hardening |
| [05 — DevOps & DevSecOps](05-devops-devsecops.md) | CI/CD, ambientes, pipeline de segurança, observabilidade |
| [06 — LGPD & GDPR](06-lgpd-gdpr.md) | Bases legais, direitos do titular, ROPA, retenção |
| [07 — DPIA / RIPD](07-dpia.md) | Relatório de Impacto à Proteção de Dados (Folha de Pagamento + Denúncias Georreferenciadas) |
| [07b — Banco de Dados](07-banco-de-dados.md) | Modelo, RLS, índices, PostGIS |
| [08 — Mobile](08-mobile.md) | App do Cidadão (Expo), arquitetura e fluxos |
| [09 — Escalabilidade](09-escalabilidade.md) | Estratégia de escala, capacidade, multi-região |
| [10 — Stack Tecnológica](10-stack-tecnologica.md) | Tecnologias e justificativas |
| [11 — Roadmap](11-roadmap.md) | Fases, marcos e critérios de saída |
| [12 — Infraestrutura (Servidor Lidera)](12-infraestrutura.md) | Mapeamento no servidor existente, o que reusar/provisionar, RLS x superusuário |
| [ADRs](adr/) | Decisões de arquitetura registradas |

## Instalação

| Doc | Conteúdo |
|-----|----------|
| [Instalação Windows Server (2019/2022)](instalacao/01-windows-server.md) | Manual passo a passo para operadores Lidera: Docker em WSL2 (recomendado) e instalação nativa |
| [Instalação Linux (Ubuntu/Debian)](instalacao/02-linux.md) | Manual passo a passo para VM/bare-metal: Docker Compose (recomendado) e instalação nativa com systemd |
| [Docker / Docker Compose (dev + produção)](instalacao/03-docker.md) | Manual detalhado copia-e-cola: dev local, produção (Servidor Lidera), build de imagens, operação, Nginx+Cloudflare, troubleshooting e checklist de segurança |
| [Instalação GCP (Cloud Run + Cloud SQL + Memorystore + GCS)](instalacao/04-gcp.md) | Manual completo para Google Cloud: APIs a ativar, Cloud Run (API+Web), Cloud SQL PostgreSQL 16/PostGIS, Memorystore Redis 7, GCS (interop S3), Cloud Armor/WAF, Secret Manager, Terraform, migrations, operação e checklist de segurança |
| [Instalação AWS (ECS Fargate + RDS + ElastiCache + S3)](instalacao/05-aws.md) | Manual completo para AWS: VPC, ECS Fargate, RDS PostgreSQL 16/PostGIS, ElastiCache Redis 7, S3, ALB+WAF, Secrets Manager, Terraform, migrations, operação e checklist de segurança |

> **Índice de instalação:** [`instalacao/README.md`](instalacao/README.md) reúne os cinco manuais e a comparação entre ambientes. Scripts **Terraform** prontos para nuvem em [`../infra/terraform/gcp/`](../infra/terraform/gcp/) e [`../infra/terraform/aws/`](../infra/terraform/aws/).

Specs por módulo em [`../specs/`](../specs/). Orquestração do Claude Code em [`../.claude/`](../.claude/) e [`../CLAUDE.md`](../CLAUDE.md).
