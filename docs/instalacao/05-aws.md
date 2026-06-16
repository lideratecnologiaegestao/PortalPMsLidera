# Manual de Instalação — Portal de Prefeitura na AWS

> **Versão:** 1.0 — 2026-06-16
> **Público-alvo:** engenheiro de infraestrutura ou operador que vai provisionar e manter o Portal de Prefeitura (SaaS multi-tenant) na Amazon Web Services.
> **Pré-leitura recomendada:** [`docs/01-arquitetura.md`](../01-arquitetura.md), [`docs/04-seguranca.md`](../04-seguranca.md), [`docs/07-banco-de-dados.md`](../07-banco-de-dados.md), [`docs/12-infraestrutura.md`](../12-infraestrutura.md).

---

## Sumário

1. [Visão Geral e Arquitetura AWS](#1-visão-geral-e-arquitetura-aws)
2. [Tabela de Serviços AWS](#2-tabela-de-serviços-aws)
3. [Mapeamento Componente → Serviço AWS](#3-mapeamento-componente--serviço-aws)
   - 3.1 [API e Web → ECS Fargate](#31-api-nestjs-3001-e-web-nextjs-3000--ecs-fargate)
   - 3.2 [PostgreSQL 16 + PostGIS → RDS](#32-postgresql-16--postgis--rds-for-postgresql-16)
   - 3.3 [Redis 7 → ElastiCache](#33-redis-7--elasticache-for-redis-7)
   - 3.4 [Object Storage → Amazon S3](#34-object-storage--amazon-s3)
   - 3.5 [Edge e Multi-tenant → ALB + WAF + ACM](#35-edge-e-multi-tenant--alb--waf--acm)
   - 3.6 [Registry → ECR](#36-registry--ecr)
   - 3.7 [Segredos → Secrets Manager](#37-segredos--secrets-manager)
4. [Passo a Passo Numerado](#4-passo-a-passo-numerado)
   - 4.1 [Configurar credenciais AWS](#41-configurar-credenciais-aws)
   - 4.2 [Criar repositórios ECR e fazer push das imagens](#42-criar-repositórios-ecr-e-fazer-push-das-imagens)
   - 4.3 [Aplicar Terraform](#43-aplicar-terraform)
   - 4.4 [Pós-Terraform: configurar banco](#44-pós-terraform-configurar-banco)
   - 4.5 [Rodar as 62 migrations em ordem](#45-rodar-as-62-migrations-em-ordem)
   - 4.6 [Popular segredos no Secrets Manager](#46-popular-segredos-no-secrets-manager)
   - 4.7 [Seed do primeiro tenant e admin](#47-seed-do-primeiro-tenant-e-admin)
   - 4.8 [Configurar DNS e domínio](#48-configurar-dns-e-domínio)
   - 4.9 [Smoke test](#49-smoke-test)
5. [Operações](#5-operações)
   - 5.1 [Backups](#51-backups)
   - 5.2 [Logs](#52-logs)
   - 5.3 [Monitoramento e Alertas](#53-monitoramento-e-alertas)
   - 5.4 [Estimativa de Custos](#54-estimativa-de-custos)
   - 5.5 [Deploy de Atualizações](#55-deploy-de-atualizações)
6. [Troubleshooting e Checklist de Segurança](#6-troubleshooting-e-checklist-de-segurança)
   - 6.1 [Problemas Comuns](#61-problemas-comuns)
   - 6.2 [Checklist de Segurança](#62-checklist-de-segurança)

---

## 1. Visão Geral e Arquitetura AWS

O Portal de Prefeitura é uma plataforma **SaaS multi-tenant**: um único código e uma única infraestrutura atendem N prefeituras simultaneamente. O isolamento entre tenants é garantido por **Row Level Security (RLS)** no PostgreSQL — cada prefeitura lê e escreve exclusivamente seus próprios dados, sem possibilidade de vazamento entre tenants. O tenant ativo é resolvido pelo cabeçalho `Host` da requisição HTTP, processado pelo ALB (host-based routing) antes de chegar aos containers.

A fronteira de camadas é inviolável: **web e app falam somente com a API**. O frontend Next.js nunca acessa diretamente o banco de dados, o storage, as filas ou APIs externas. Tudo passa pela API NestJS. Uploads chegam como multipart à API, que grava no S3. Essa arquitetura simplifica o modelo de segurança na AWS: só a camada da API precisa de acesso às subnets privadas com RDS, ElastiCache e IAM Role para S3.

Na AWS, a plataforma usa ECS Fargate (containers serverless sem gerenciar instâncias EC2), RDS para PostgreSQL 16 com PostGIS, ElastiCache para Redis 7, S3 como object storage nativo (substituindo o MinIO do ambiente Lidera), ALB com WAF v2 como único ponto de entrada público, e Secrets Manager para todos os segredos. Nenhum componente de backend fica em subnet pública.

```mermaid
flowchart TB
    subgraph Internet["Internet"]
        CIDADAO["Cidadão / Navegador"]
        APP["App do Cidadão (mobile)"]
    end

    subgraph DNS["DNS"]
        R53["Route 53\n*.prefeitura.gov.br"]
    end

    subgraph Edge["Edge (subnet pública)"]
        WAF["AWS WAF v2\nrate-limit + OWASP"]
        ALB["Application Load Balancer\nHTTPS 443 — TLS ACM wildcard\nhost-based routing"]
        IGW["Internet Gateway"]
        NATGW["NAT Gateway\n(saída do tráfego privado)"]
    end

    subgraph Compute["ECS Fargate (subnet privada)"]
        API["portal-api\nNestJS :3001\n1024 CPU / 2048 MB"]
        WEB["portal-web\nNext.js :3000\n512 CPU / 1024 MB"]
    end

    subgraph Data["Dados (subnet privada — sem acesso público)"]
        RDS[("RDS PostgreSQL 16\nPostGIS\nMulti-AZ")]
        REDIS[("ElastiCache Redis 7\nReplication Group\nTLS")]
        S3[("Amazon S3\nbucket: portal\nSSE + versioning")]
    end

    subgraph Support["Suporte"]
        ECR["ECR\nportal/api\nportal/web"]
        SM["Secrets Manager\nJWT, DB, SMTP..."]
        CW["CloudWatch\nLogs + Metrics + Alarms"]
        IAM["IAM Roles\nTask Role (S3)\nExecution Role (ECR+SM)"]
    end

    CIDADAO --> R53
    APP --> R53
    R53 --> WAF
    WAF --> ALB
    ALB -->|"Host: *.prefeitura → :3000"| WEB
    ALB -->|"/api/* → :3001"| API
    WEB --> API
    API --> RDS
    API --> REDIS
    API --> S3
    API --> SM
    Compute --> NATGW
    NATGW --> IGW
    IGW --> Internet
    ECR --> Compute
    CW -.-> Compute
    CW -.-> Data
```

> **Atenção:** O diagrama acima representa o fluxo lógico. Na prática, o NAT Gateway fica em uma subnet pública e as subnets privadas roteiam o tráfego de saída (p. ex., chamadas à API Anthropic, gov.br OIDC, SMTP) através do NAT. O IGW não atende diretamente os containers — só o ALB e o NAT Gateway têm IP público.

---

## 2. Tabela de Serviços AWS

| Serviço | Uso neste projeto | Por quê |
|---------|-------------------|---------|
| **VPC** | Rede isolada com subnets públicas e privadas em múltiplas AZs | Isolamento de rede; os dados nunca ficam em subnet pública |
| **Subnets públicas** | ALB, NAT Gateway | Ponto de entrada público único (ALB) e saída para internet (NAT) |
| **Subnets privadas** | ECS Fargate, RDS, ElastiCache | Backend e dados sem IP público |
| **Internet Gateway (IGW)** | Saída do ALB e do NAT Gateway para a internet | Requisito do VPC para conectividade pública |
| **NAT Gateway** | Permite que containers privados façam requisições de saída (gov.br, Anthropic, SMTP) | Containers sem IP público precisam de saída gerenciada |
| **ECS Fargate** | Executa os containers portal-api e portal-web | Serverless: sem gerenciar instâncias EC2; escala automática; paga por uso |
| **ECR (Elastic Container Registry)** | Registry privado para imagens Docker das apps | Integrado ao ECS; sem custo de transferência dentro da mesma região |
| **RDS for PostgreSQL 16** | Banco de dados relacional com PostGIS | Managed: backups automáticos, Multi-AZ, PITR, patches de segurança automáticos |
| **ElastiCache for Redis 7** | BullMQ (filas), cache de sessão e pub/sub | Managed: replication group, failover, TLS em trânsito, sem gerenciar Redis |
| **Amazon S3** | Object storage para anexos, fotos, PDFs do Diário Oficial | Substitui o MinIO; nativo AWS SDK; durabilidade 99,999999999%; custo baixo |
| **AWS Secrets Manager** | Armazenamento seguro de segredos (JWT, DB passwords, API keys) | Rotação automática, integração nativa com ECS Task Definitions, trilha CloudTrail |
| **ALB (Application Load Balancer)** | Único ponto de entrada HTTPS; host-based routing multi-tenant | TLS offload, health checks, integração WAF e ACM, sticky sessions se necessário |
| **AWS WAF v2** | Rate limiting, bloqueio de IPs maliciosos, regras OWASP managed | Proteção L7 antes de chegar aos containers; sem alterar código da aplicação |
| **ACM (Certificate Manager)** | Certificado TLS wildcard *.prefeitura.gov.br | Provisionamento e renovação automáticos; integrado ao ALB sem custo de certificado |
| **Route 53** | DNS autoritativo para os domínios das prefeituras | Alias para o ALB (suporte a apex domain); health checks; latency routing opcional |
| **CloudWatch Logs + Metrics + Alarms** | Logs dos containers ECS, métricas de RDS/ElastiCache, alertas | Observabilidade centralizada; alertas para on-call |
| **IAM** | Roles para ECS Task (acesso S3) e GitHub Actions OIDC (ECR push) | Principle of least privilege; sem access keys de longa duração |
| **CloudFront (opcional)** | CDN na frente do ALB para assets estáticos do Next.js | Reduz latência e custo de transferência; cache de assets JS/CSS/imagens |

---

## 3. Mapeamento Componente → Serviço AWS

### 3.1 API (NestJS :3001) e Web (Next.js :3000) → ECS Fargate

Os dois serviços são executados como **ECS Services** separados dentro de um mesmo ECS Cluster. Cada serviço tem sua própria Task Definition com a imagem correspondente no ECR.

**Configuração das Task Definitions:**

| Parâmetro | portal-api | portal-web |
|-----------|------------|------------|
| CPU | 1024 (1 vCPU) | 512 (0.5 vCPU) |
| Memória | 2048 MB | 1024 MB |
| Porta do container | 3001 | 3000 |
| Health check path | `/api/health/ready` | `/` |
| Log group | `/ecs/portal-api` | `/ecs/portal-web` |

A API NestJS requer CPU e memória maiores porque executa o runtime do Tesseract (OCR), processa filas BullMQ e faz inferência via API Anthropic. O Web (Next.js) serve SSR/ISR e encaminha requisições para a API, com footprint menor.

**Auto-scaling:** Configure Application Auto Scaling com target tracking em CPU (alvo 60%) e, opcionalmente, em requisições por target no ALB. Defina mínimo de 1 tarefa e máximo de N conforme capacidade.

```hcl
# Exemplo de task definition (trecho Terraform)
resource "aws_ecs_task_definition" "api" {
  family                   = "portal-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "portal-api"
    image = "${aws_ecr_repository.api.repository_url}:${var.image_tag_api}"
    portMappings = [{ containerPort = 3001, protocol = "tcp" }]

    environment = [
      { name = "PORT",             value = "3001" },
      { name = "NODE_ENV",         value = "production" },
      { name = "BULLMQ_PREFIX",    value = "portal" },
      { name = "REDIS_DB",         value = "1" },
      { name = "STORAGE_BUCKET",   value = "portal" },
      { name = "STORAGE_FORCE_PATH_STYLE", value = "false" },
      { name = "STORAGE_REGION",   value = var.aws_region }
    ]

    secrets = [
      { name = "DATABASE_URL",        valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::" },
      { name = "AUTH_JWT_SECRET",     valueFrom = "${aws_secretsmanager_secret.app.arn}:AUTH_JWT_SECRET::" },
      { name = "CPF_PEPPER",          valueFrom = "${aws_secretsmanager_secret.app.arn}:CPF_PEPPER::" },
      { name = "ANTHROPIC_API_KEY",   valueFrom = "${aws_secretsmanager_secret.app.arn}:ANTHROPIC_API_KEY::" }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = "/ecs/portal-api"
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:3001/api/health/ready || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}
```

**Alternativas ao ECS Fargate:**

- **EKS (Kubernetes):** Recomendado quando há necessidade de escala horizontal automática complexa (HPA baseado em métricas customizadas de BullMQ), múltiplos workloads compartilhando o cluster, ou quando a equipe já opera Kubernetes. Custo fixo do control plane (~$72/mês) mais EC2/Fargate para nós.
- **EC2 + Docker Compose:** Menor custo para cargas pequenas e previsíveis (uma prefeitura de pequeno porte). Exige gerenciar patching, auto-recovery e disco. Adequado para o modelo Servidor Lidera descrito em [`docs/12-infraestrutura.md`](../12-infraestrutura.md).

### 3.2 PostgreSQL 16 + PostGIS → RDS for PostgreSQL 16

O banco de dados é o coração do isolamento multi-tenant via RLS. Toda a lógica de segurança de dados está nas 62 migrations SQL em `db/*.sql`.

**Configuração do RDS:**

| Parâmetro | Desenvolvimento/Homologação | Produção |
|-----------|----------------------------|---------|
| Classe | `db.t3.medium` | `db.r6g.large` ou maior |
| Storage | 50 GB gp3 | 100 GB+ gp3 (auto-scaling habilitado) |
| Multi-AZ | Não | Sim (failover automático) |
| Backup | 7 dias | 35 dias |
| Engine | PostgreSQL 16 | PostgreSQL 16 |
| Acesso público | `false` | `false` |

**Por que o RDS preserva o RLS — ponto crítico:**

No PostgreSQL on-premise, o usuário `postgres` (superusuário) ignora automaticamente todas as policies de RLS, tornando o RLS ineficaz se o app conectar como superusuário. No RDS for PostgreSQL, o master user criado pela AWS (`rdsadmin`) é tecnicamente privilegiado dentro do sistema interno da AWS, mas o master user da instância que você define (`portal_master`, por exemplo) é criado como `NOSUPERUSER` e **não tem `BYPASSRLS`**. Isso significa que, diferentemente de um PostgreSQL on-premise onde um DBA descuidado poderia conectar a app como `postgres`, no RDS essa armadilha não existe para o master user regular.

Ainda assim, por princípio de menor privilégio e para tornar a política explícita, crie e use exclusivamente `portal_app` (role de escrita da aplicação) e `portal_ro` (somente leitura). **Nunca use o master user como `DATABASE_URL` da aplicação.** O master user serve apenas para operações de administração do banco (criar extensões, criar roles, migrations DDL).

**Subnet group e security group:**

```hcl
resource "aws_db_subnet_group" "portal" {
  name       = "portal-db-subnet-group"
  subnet_ids = var.private_subnet_ids   # apenas subnets privadas

  tags = { Name = "portal-db-subnet-group" }
}

resource "aws_security_group" "rds" {
  name   = "portal-rds-sg"
  vpc_id = var.vpc_id

  # Aceita conexões PostgreSQL apenas da ECS
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # Sem egress rules — RDS não precisa sair para internet
}
```

**Habilitando PostGIS e pgvector:**

Após criar a instância RDS, conecte como master user e execute:

```sql
-- Obrigatório para funcionamento das queries georreferenciadas (app do cidadão)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Obrigatório para uuid_generate_v4() usado nas migrations
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Opcional: busca semântica com embeddings (migrations 053/054)
-- Habilite apenas se for usar IA com pgvector
CREATE EXTENSION IF NOT EXISTS vector;
```

> **Atenção:** O RDS suporta PostGIS nativamente a partir do PostgreSQL 12+. Para `vector` (pgvector), verifique se a versão do engine RDS suporta a extensão (disponível no RDS PostgreSQL 15+). Se não suportar, a feature de busca semântica fica desabilitada sem impacto nas demais funcionalidades.

### 3.3 Redis 7 → ElastiCache for Redis 7

O Redis é usado exclusivamente pela API (workers BullMQ) e nunca exposto ao frontend. As filas BullMQ gerenciam notificações, processamento de OCR, envio de e-mails e integração WhatsApp.

**Configuração do Replication Group:**

| Parâmetro | Dev | Prod |
|-----------|-----|------|
| Node type | `cache.t3.micro` | `cache.r6g.large` |
| Número de shards | 1 | 1 ou 2 (se alto volume de filas) |
| Réplicas por shard | 0 | 1 (failover automático) |
| TLS em trânsito | Recomendado | Obrigatório (`REDIS_TLS=true`) |
| Auth token | Opcional em dev | Obrigatório (`REDIS_PASSWORD`) |
| Subnet group | Privada | Privada |

```hcl
resource "aws_elasticache_replication_group" "portal" {
  replication_group_id          = "portal-redis"
  description                   = "Portal Prefeitura - BullMQ e cache"
  node_type                     = var.redis_node_type
  num_cache_clusters            = var.environment == "prod" ? 2 : 1
  port                          = 6379
  subnet_group_name             = aws_elasticache_subnet_group.portal.name
  security_group_ids            = [aws_security_group.redis.id]
  transit_encryption_enabled    = true
  auth_token                    = var.redis_auth_token  # vem do Secrets Manager
  at_rest_encryption_enabled    = true
  automatic_failover_enabled    = var.environment == "prod"
  engine_version                = "7.0"

  parameter_group_name = "default.redis7"
}
```

**Variáveis de ambiente para a API:**

```
REDIS_HOST=<endpoint-do-replication-group>.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=<auth-token>
REDIS_DB=1
REDIS_TLS=true
BULLMQ_PREFIX=portal
```

> **Atenção:** O BullMQ exige `maxRetriesPerRequest: null` e `enableReadyCheck: false` na conexão ioredis. Esses valores devem estar no código da API (`queue.module.ts` / `redis.config.ts`) — não são variáveis de ambiente. Verifique que não foram sobrescritos antes de conectar com TLS habilitado.

**Security group do ElastiCache:**

```hcl
resource "aws_security_group" "redis" {
  name   = "portal-redis-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}
```

### 3.4 Object Storage → Amazon S3

Na AWS, o S3 substitui completamente o MinIO usado no ambiente Lidera. O cliente AWS SDK v3 (usado pela API NestJS) suporta S3 nativo e MinIO — a diferença está em duas variáveis de ambiente.

**Diferença crítica MinIO → S3 nativo:**

| Parâmetro | MinIO (Lidera) | S3 nativo (AWS) |
|-----------|----------------|-----------------|
| `STORAGE_FORCE_PATH_STYLE` | `true` | `false` |
| `STORAGE_ENDPOINT` | `http://portal-minio:9000` | Omitir ou `https://s3.REGIAO.amazonaws.com` |
| Autenticação | Access key + secret da conta MinIO | IAM user dedicado com política mínima |

Com `STORAGE_FORCE_PATH_STYLE=false` e sem `STORAGE_ENDPOINT` customizado, o SDK detecta automaticamente o endpoint regional correto usando `STORAGE_REGION`. Isso é o comportamento padrão e recomendado para S3 nativo.

**Configuração do bucket:**

```bash
# Criar bucket
aws s3api create-bucket \
  --bucket portal \
  --region us-east-1

# Bloquear acesso público (obrigatório — os arquivos são servidos via API, nunca diretamente)
aws s3api put-public-access-block \
  --bucket portal \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Habilitar versioning (suporte a rollback de arquivos)
aws s3api put-bucket-versioning \
  --bucket portal \
  --versioning-configuration Status=Enabled

# Criptografia em repouso (SSE-S3)
aws s3api put-bucket-encryption \
  --bucket portal \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"},
      "BucketKeyEnabled": true
    }]
  }'
```

**IAM Policy para o usuário de acesso:**

A API usa variáveis `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY`. Crie um IAM User dedicado (não use credenciais root ou de administrador) com a seguinte política mínima:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PortalS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObjectVersion",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::portal/*"
    },
    {
      "Sid": "PortalS3List",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::portal"
    }
  ]
}
```

As credenciais desse IAM User são armazenadas no Secrets Manager e injetadas como `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY` na task definition da API.

> **Alternativa avançada:** Se preferir evitar access keys de longa duração, configure a task role ECS com permissão direta ao S3 e remova as variáveis `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`. O SDK AWS detecta automaticamente credenciais via instance metadata. Isso requer que o código da API não passe explicitamente as credenciais ao construir o cliente S3 — verifique `storage.service.ts` antes de adotar essa abordagem.

### 3.5 Edge e Multi-tenant → ALB + WAF + ACM

O ALB é o único ponto de entrada público da plataforma. Ele encerra TLS, roteia por host e integra com WAF. Nenhum container tem IP público.

**Certificado ACM:**

Crie um certificado wildcard para cobrir todos os tenants:

```bash
aws acm request-certificate \
  --domain-name "*.prefeitura.gov.br" \
  --subject-alternative-names "prefeitura.gov.br" \
  --validation-method DNS \
  --region us-east-1
```

Valide o certificado adicionando os registros CNAME no Route 53 (o console ACM mostra os valores exatos). O ACM renova automaticamente.

**Listeners e regras do ALB:**

```
Listener 80 (HTTP)  → Redirect para HTTPS 443 (301)

Listener 443 (HTTPS, cert ACM wildcard):
  Regra 1: Host header = api.prefeitura.gov.br → Target Group portal-api (:3001)
  Regra 2: Path = /api/*  → Target Group portal-api (:3001)
  Regra 3: Default         → Target Group portal-web (:3000)
```

O multi-tenant funciona porque o Next.js lê o header `Host` da requisição e passa o hostname para a API via `X-Tenant-Host`. A API resolve o tenant pela tabela `tenants` (campo `domain`) e seta o `app.current_tenant_id` na conexão Prisma, ativando o RLS.

```hcl
resource "aws_lb_listener_rule" "api_path" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}

resource "aws_lb_listener_rule" "api_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 90

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = ["api.prefeitura.gov.br"]
    }
  }
}
```

**Health checks dos Target Groups:**

- API: `GET /api/health/ready`, porta 3001, retorno esperado HTTP 200. Threshold: 3 healthy / 3 unhealthy. Interval: 30s.
- Web: `GET /`, porta 3000, retorno esperado HTTP 200. Threshold: 3/3. Interval: 30s.

**WAF v2:**

Associe o WAF ao ALB com pelo menos:

```hcl
resource "aws_wafv2_web_acl" "portal" {
  name  = "portal-waf"
  scope = "REGIONAL"

  default_action { allow {} }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action { none {} }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 2
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "portal-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "portal_alb" {
  resource_arn = aws_lb.portal.arn
  web_acl_arn  = aws_wafv2_web_acl.portal.arn
}
```

**Alternativa: CloudFront na frente do ALB**

CloudFront pode ser posicionado entre o Route 53 e o ALB para cache de assets estáticos do Next.js (JS, CSS, imagens), redução de custo de transferência e proteção DDoS adicional (AWS Shield Standard). Configure o CloudFront com dois origins: `portal-web` (padrão) e `portal-api` (para path `/api/*`). O WAF é então associado ao CloudFront (escopo `CLOUDFRONT`) em vez do ALB.

### 3.6 Registry → ECR

Dois repositórios ECR privados armazenam as imagens Docker:

```bash
aws ecr create-repository --repository-name portal/api --region us-east-1
aws ecr create-repository --repository-name portal/web --region us-east-1
```

**Lifecycle policy** (manter apenas as 10 imagens mais recentes, economiza custo de storage):

```json
{
  "rules": [{
    "rulePriority": 1,
    "description": "Manter 10 imagens mais recentes",
    "selection": {
      "tagStatus": "any",
      "countType": "imageCountMoreThan",
      "countNumber": 10
    },
    "action": { "type": "expire" }
  }]
}
```

```bash
aws ecr put-lifecycle-policy \
  --repository-name portal/api \
  --lifecycle-policy-text file://ecr-lifecycle.json \
  --region us-east-1
```

**Build e push via GitHub Actions com OIDC (sem access keys):**

```yaml
# .github/workflows/deploy.yml (trecho)
- name: Configure AWS credentials (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::ACCOUNT_ID:role/github-actions-portal
    aws-region: us-east-1

- name: Login no ECR
  uses: aws-actions/amazon-ecr-login@v2

- name: Build e push portal-api
  run: |
    IMAGE_URI=${{ env.ECR_REGISTRY }}/portal/api:${{ github.sha }}
    docker build -t $IMAGE_URI ./api
    docker push $IMAGE_URI
    echo "IMAGE_TAG_API=${{ github.sha }}" >> $GITHUB_ENV

- name: Build e push portal-web
  run: |
    IMAGE_URI=${{ env.ECR_REGISTRY }}/portal/web:${{ github.sha }}
    docker build -t $IMAGE_URI ./web
    docker push $IMAGE_URI
```

As imagens são multistage (Node 20 Alpine) conforme os Dockerfiles em `./api` e `./web`. A imagem da API inclui `tesseract-ocr`, `poppler-utils` e `postgresql-client` para OCR e acesso ao banco via migrations.

### 3.7 Segredos → Secrets Manager

Todos os segredos ficam no Secrets Manager e nunca em variáveis de ambiente plaintext na task definition ou no git.

**Estrutura recomendada:** um secret JSON por ambiente, com todas as chaves do `.env.example`:

```bash
# Criar o secret principal da aplicação
aws secretsmanager create-secret \
  --name "portal/prod/app" \
  --description "Segredos da aplicação Portal Prefeitura (produção)" \
  --region us-east-1
```

**Conteúdo do secret JSON:**

```json
{
  "DATABASE_URL": "postgresql://portal_app:SENHA_APP@RDS_ENDPOINT:5432/portal",
  "DATABASE_URL_READONLY": "postgresql://portal_ro:SENHA_RO@RDS_ENDPOINT:5432/portal",
  "REDIS_PASSWORD": "REDIS_AUTH_TOKEN",
  "AUTH_JWT_SECRET": "string-de-no-minimo-32-caracteres-aleatorios",
  "AUTH_SESSION_TTL": "8h",
  "CPF_PEPPER": "hex-de-32-bytes-gerado-com-openssl-rand-hex-32",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "IA_MODEL": "claude-sonnet-4-6",
  "EMBEDDINGS_PROVIDER": "voyage",
  "VOYAGE_API_KEY": "pa-...",
  "VOYAGE_RERANK_MODEL": "rerank-2",
  "GOVBR_CLIENT_ID": "...",
  "GOVBR_CLIENT_SECRET": "...",
  "GOVBR_REDIRECT_URI": "https://api.prefeitura.gov.br/api/auth/govbr/callback",
  "GOVBR_PROVIDER_URL": "https://sso.staging.acesso.gov.br",
  "GOVBR_SCOPES": "openid email profile",
  "SMTP_HOST": "email-smtp.us-east-1.amazonaws.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "AKIAIOSFODNN7EXAMPLE",
  "SMTP_PASS": "...",
  "SMTP_FROM": "noreply@prefeitura.gov.br",
  "STORAGE_ACCESS_KEY": "AKIA...",
  "STORAGE_SECRET_KEY": "...",
  "GOOGLE_MAPS_API_KEY": "AIza...",
  "METRICS_TOKEN": "token-para-/metrics",
  "DIARIO_SIGNING_KEY": "...",
  "ICP_CERT_PATH": "/app/certs/icp.p12",
  "ICP_CERT_PASSWORD": "...",
  "WHATSAPP_PROVIDER": "zapi",
  "ZAPI_INSTANCE_ID": "...",
  "ZAPI_TOKEN": "...",
  "ZAPI_CLIENT_TOKEN": "...",
  "EVOLUTION_API_URL": "...",
  "EVOLUTION_API_KEY": "...",
  "CLAMAV_HOST": "",
  "CLAMAV_PORT": "3310"
}
```

Na task definition ECS, cada variável é referenciada individualmente usando a sintaxe `ARN:KEY::`:

```json
{
  "secrets": [
    {
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:portal/prod/app:DATABASE_URL::"
    },
    {
      "name": "AUTH_JWT_SECRET",
      "valueFrom": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:portal/prod/app:AUTH_JWT_SECRET::"
    }
  ]
}
```

A execution role da ECS Task precisa da permissão `secretsmanager:GetSecretValue` no secret ARN correspondente.

---

## 4. Passo a Passo Numerado

### Pré-requisitos

Antes de começar, certifique-se de ter:

| Ferramenta | Versão mínima | Finalidade |
|------------|---------------|------------|
| AWS CLI | 2.x | Comandos de provisionamento e operação |
| Terraform | 1.5+ | IaC para VPC, ECS, RDS, ElastiCache, ALB, WAF |
| Docker | 24.x | Build das imagens localmente |
| psql | 16.x | Conexão ao RDS via bastion para migrations |
| jq | qualquer | Processar JSON no terminal (opcional, mas útil) |

A conta AWS deve ter permissões de administrador (ou permissões granulares para criar VPC, ECS, RDS, ElastiCache, S3, IAM Roles, ALB, WAF, ACM, Route 53, Secrets Manager).

### 4.1 Configurar Credenciais AWS

```bash
# Opção 1: Perfil nomeado com access key (desenvolvimento / CI sem OIDC)
aws configure --profile portal-prefeitura
# Informe: AWS Access Key ID, Secret Access Key, região (us-east-1), formato (json)

# Exportar o perfil para os comandos seguintes
export AWS_PROFILE=portal-prefeitura
export AWS_DEFAULT_REGION=us-east-1

# Verificar identidade
aws sts get-caller-identity
```

```bash
# Opção 2: AWS SSO (recomendado para equipes)
aws sso configure --profile portal-prefeitura
aws sso login --profile portal-prefeitura
export AWS_PROFILE=portal-prefeitura
```

### 4.2 Criar Repositórios ECR e Fazer Push das Imagens

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Criar repositórios
aws ecr create-repository --repository-name portal/api --region $REGION
aws ecr create-repository --repository-name portal/web --region $REGION

# Configurar lifecycle policy em ambos
LIFECYCLE_POLICY='{
  "rules": [{
    "rulePriority": 1,
    "description": "Manter 10 imagens mais recentes",
    "selection": {"tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10},
    "action": {"type": "expire"}
  }]
}'
aws ecr put-lifecycle-policy --repository-name portal/api --lifecycle-policy-text "$LIFECYCLE_POLICY" --region $REGION
aws ecr put-lifecycle-policy --repository-name portal/web --lifecycle-policy-text "$LIFECYCLE_POLICY" --region $REGION

# Autenticar Docker no ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_BASE

# Build e push da API (multistage Dockerfile em ./api)
# A imagem inclui tesseract-ocr, poppler e postgresql16-client
IMAGE_TAG=$(git rev-parse --short HEAD)

docker build -t $ECR_BASE/portal/api:$IMAGE_TAG ./api
docker tag $ECR_BASE/portal/api:$IMAGE_TAG $ECR_BASE/portal/api:latest
docker push $ECR_BASE/portal/api:$IMAGE_TAG
docker push $ECR_BASE/portal/api:latest

# Build e push do Web (multistage Dockerfile em ./web)
docker build -t $ECR_BASE/portal/web:$IMAGE_TAG ./web
docker tag $ECR_BASE/portal/web:$IMAGE_TAG $ECR_BASE/portal/web:latest
docker push $ECR_BASE/portal/web:$IMAGE_TAG
docker push $ECR_BASE/portal/web:latest

echo "Imagens publicadas com tag: $IMAGE_TAG"
```

> **Atenção:** O build da imagem da API pode levar alguns minutos na primeira vez devido à instalação de tesseract-ocr e poppler. Use `--platform linux/amd64` se estiver fazendo build em uma máquina ARM (Apple Silicon ou AWS Graviton) para garantir compatibilidade com o Fargate padrão.

### 4.3 Aplicar Terraform

O código Terraform deve estar em `infra/terraform/aws/`. A estrutura recomendada de módulos:

```
infra/terraform/aws/
├── main.tf           # provider, backend S3 para state
├── variables.tf
├── terraform.tfvars  # valores não-secretos (NÃO commitar com segredos)
├── outputs.tf
├── modules/
│   ├── vpc/          # VPC, subnets, IGW, NAT GW, route tables
│   ├── ecs/          # cluster, task definitions, services, auto-scaling
│   ├── rds/          # instância, subnet group, parameter group
│   ├── elasticache/  # replication group, subnet group
│   ├── s3/           # bucket, políticas, versioning
│   ├── alb/          # load balancer, listeners, target groups
│   ├── waf/          # web ACL, rules, associação
│   ├── ecr/          # repositórios, lifecycle
│   ├── iam/          # roles ECS execution/task, policies
│   └── secrets/      # secrets manager, rotação
└── environments/
    ├── dev.tfvars
    └── prod.tfvars
```

```bash
cd infra/terraform/aws

# Backend S3 para armazenar o state (crie o bucket antes)
aws s3api create-bucket --bucket portal-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket portal-terraform-state \
  --versioning-configuration Status=Enabled

# Inicializar
terraform init \
  -backend-config="bucket=portal-terraform-state" \
  -backend-config="key=portal/prod/terraform.tfstate" \
  -backend-config="region=us-east-1"

# Planejar (revise antes de aplicar — especialmente RDS e ElastiCache)
terraform plan \
  -var-file=environments/prod.tfvars \
  -var="image_tag_api=$IMAGE_TAG" \
  -var="image_tag_web=$IMAGE_TAG" \
  -out=tfplan

# Aplicar
terraform apply tfplan
```

> **Atenção:** O provisionamento completo (VPC + RDS + ElastiCache + ECS + ALB) leva entre 15 e 30 minutos. O RDS Multi-AZ é o passo mais demorado (~15 min). Não interrompa o `terraform apply` durante esse processo.

Após o apply, capture os outputs:

```bash
terraform output -json > infra-outputs.json
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
ALB_DNS=$(terraform output -raw alb_dns_name)
echo "RDS: $RDS_ENDPOINT"
echo "Redis: $REDIS_ENDPOINT"
echo "ALB: $ALB_DNS"
```

### 4.4 Pós-Terraform: Configurar Banco

O RDS é criado sem extensões e sem as roles de aplicação. Esta etapa usa o master user para configurar o banco antes das migrations.

**Opção A — Via Session Manager (SSM) em uma instância bastion efêmera:**

```bash
# Criar instância bastion temporária (use Amazon Linux 2023, subnet privada)
# Conectar via SSM (sem SSH aberto)
aws ssm start-session --target i-INSTANCE_ID

# Dentro da sessão SSM, instalar psql
sudo dnf install -y postgresql16

# Conectar ao RDS como master user
export PGPASSWORD="MASTER_PASSWORD"
psql -h $RDS_ENDPOINT -U portal_master -d postgres
```

**Opção B — Via ECS one-off task (sem bastion):**

```bash
# Rodar task temporária com shell para configuração
aws ecs run-task \
  --cluster portal-cluster \
  --task-definition portal-api \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[PRIVATE_SUBNET_ID],securityGroups=[ECS_SG_ID]}" \
  --overrides '{"containerOverrides":[{"name":"portal-api","command":["sh","-c","sleep 3600"]}]}'
# Conectar com ECS exec
aws ecs execute-command --cluster portal-cluster --task TASK_ARN \
  --container portal-api --interactive --command "/bin/sh"
```

**Comandos SQL de configuração inicial:**

```sql
-- Conectado como master user (portal_master)

-- 1. Criar o banco de dados
CREATE DATABASE portal
  WITH ENCODING='UTF8'
  LC_COLLATE='pt_BR.UTF-8'
  LC_CTYPE='pt_BR.UTF-8'
  TEMPLATE=template0;

-- 2. Conectar ao banco portal
\c portal

-- 3. Habilitar extensões (obrigatórias)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busca por similaridade de texto
CREATE EXTENSION IF NOT EXISTS unaccent;   -- normalização de acentos para FTS

-- 4. Extensão opcional (busca semântica com IA)
-- Habilite apenas se a versão do RDS PostgreSQL suportar pgvector
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 5. Criar roles de aplicação (NOSUPERUSER NOBYPASSRLS — inviolável)
CREATE ROLE portal_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS
  PASSWORD 'SENHA_FORTE_portal_app';

CREATE ROLE portal_ro
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS
  PASSWORD 'SENHA_FORTE_portal_ro';

-- 6. Permissões básicas de conexão
GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;

-- O restante das permissões (tabelas, sequences, RLS policies)
-- é criado pelas migrations db/*.sql
```

> **Atenção:** As roles `portal_app` e `portal_ro` devem ser `NOBYPASSRLS`. Isso é a garantia técnica do isolamento multi-tenant. Se uma role tiver `BYPASSRLS`, ela lê dados de todos os tenants sem filtro — violação direta da regra inviolável 1 descrita em `CLAUDE.md`.

### 4.5 Rodar as 62 Migrations em Ordem

As migrations estão em `db/*.sql` (arquivos 001 a 062) e devem ser aplicadas em ordem estritamente alfabética. Nunca pule migrations nem altere a ordem.

**Pré-condição:** as extensões e roles da etapa 4.4 devem existir antes de rodar a migration 001.

```bash
# Conectado ao bastion ou via ECS exec (container portal-api tem psql instalado)
export DATABASE_URL="postgresql://portal_master:SENHA@RDS_ENDPOINT:5432/portal"

# O script db/run-migrations.sh já faz a ordenação correta
# Se disponível no container:
bash db/run-migrations.sh

# Alternativamente, rodar manualmente em ordem alfabética:
for f in $(ls db/*.sql | sort); do
  echo "Aplicando: $f"
  psql "$DATABASE_URL" -f "$f"
  if [ $? -ne 0 ]; then
    echo "ERRO em $f — interrompendo"
    exit 1
  fi
done

echo "Todas as 62 migrations aplicadas com sucesso."
```

**Sobre as migrations opcionais:**

O diretório `db/optional/` contém migrations para pgvector (busca semântica). Aplique apenas se:
1. A extensão `vector` foi habilitada no RDS (etapa 4.4)
2. `EMBEDDINGS_PROVIDER` está configurado como `voyage` ou `openai`
3. A IA de base de conhecimento (módulo 053/054) está ativa no tenant

```bash
# Apenas se pgvector estiver habilitado
for f in $(ls db/optional/*.sql | sort); do
  echo "Aplicando opcional: $f"
  psql "$DATABASE_URL" -f "$f"
done
```

**Transferindo permissões para portal_app após migrations:**

As migrations DDL são rodadas como master user. Após aplicar, transfira propriedade dos objetos:

```sql
-- Conectado como portal_master no banco portal
-- Dar acesso de DML ao portal_app
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;

-- Para objetos futuros (novas migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO portal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO portal_ro;
```

### 4.6 Popular Segredos no Secrets Manager

```bash
# Construir o JSON com todos os segredos
# NUNCA commite este arquivo — use um gerenciador de senhas ou stdin
cat > /tmp/portal-secrets.json << 'EOF'
{
  "DATABASE_URL": "postgresql://portal_app:SENHA_APP@RDS_ENDPOINT:5432/portal",
  "DATABASE_URL_READONLY": "postgresql://portal_ro:SENHA_RO@RDS_ENDPOINT:5432/portal",
  "REDIS_PASSWORD": "REDIS_AUTH_TOKEN",
  "AUTH_JWT_SECRET": "GERE-COM-openssl-rand-base64-48",
  "AUTH_SESSION_TTL": "8h",
  "CPF_PEPPER": "GERE-COM-openssl-rand-hex-32",
  "ANTHROPIC_API_KEY": "sk-ant-...",
  "IA_MODEL": "claude-sonnet-4-6",
  "EMBEDDINGS_PROVIDER": "voyage",
  "VOYAGE_API_KEY": "pa-...",
  "VOYAGE_RERANK_MODEL": "rerank-2",
  "GOVBR_CLIENT_ID": "...",
  "GOVBR_CLIENT_SECRET": "...",
  "GOVBR_REDIRECT_URI": "https://api.prefeitura.gov.br/api/auth/govbr/callback",
  "GOVBR_PROVIDER_URL": "https://sso.acesso.gov.br",
  "GOVBR_SCOPES": "openid email profile",
  "SMTP_HOST": "email-smtp.us-east-1.amazonaws.com",
  "SMTP_PORT": "587",
  "SMTP_USER": "SES_SMTP_USER",
  "SMTP_PASS": "SES_SMTP_PASSWORD",
  "SMTP_FROM": "noreply@prefeitura.gov.br",
  "STORAGE_ACCESS_KEY": "AKIA...",
  "STORAGE_SECRET_KEY": "...",
  "GOOGLE_MAPS_API_KEY": "AIza...",
  "METRICS_TOKEN": "GERE-COM-openssl-rand-hex-16",
  "DIARIO_SIGNING_KEY": "...",
  "WHATSAPP_PROVIDER": "zapi",
  "ZAPI_INSTANCE_ID": "...",
  "ZAPI_TOKEN": "...",
  "ZAPI_CLIENT_TOKEN": "..."
}
EOF

# Gerar os segredos aleatórios (execute antes de preencher o JSON acima)
echo "AUTH_JWT_SECRET: $(openssl rand -base64 48)"
echo "CPF_PEPPER: $(openssl rand -hex 32)"
echo "METRICS_TOKEN: $(openssl rand -hex 16)"

# Publicar no Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id "portal/prod/app" \
  --secret-string file:///tmp/portal-secrets.json \
  --region us-east-1

# Remover o arquivo temporário imediatamente
rm -f /tmp/portal-secrets.json

echo "Segredos publicados. Verifique no console AWS Secrets Manager."
```

**Rotação automática (recomendado para produção):**

Para segredos de banco de dados, configure rotação automática no Secrets Manager usando as Lambda functions gerenciadas pela AWS para PostgreSQL.

### 4.7 Seed do Primeiro Tenant e Admin

Após as migrations, o banco tem todas as tabelas mas nenhum tenant. Insira o primeiro tenant (a prefeitura) e o primeiro usuário administrador.

```bash
# Conectar como portal_app (não como master — teste o RLS desde o início)
export DATABASE_URL="postgresql://portal_app:SENHA_APP@RDS_ENDPOINT:5432/portal"
psql "$DATABASE_URL"
```

```sql
-- Inserir o primeiro tenant
INSERT INTO tenants (
  id,
  name,
  slug,
  domain,
  cnpj,
  primary_color,
  secondary_color,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'Prefeitura de Exemplo',
  'exemplo',
  'exemplo.prefeitura.gov.br',
  '00.000.000/0001-00',
  '#1351b4',    -- azul gov.br padrão (ajuste conforme identidade visual)
  '#155bcb',
  now(),
  now()
) RETURNING id;

-- Copie o UUID retornado — será necessário para criar o admin
-- Substitua TENANT_UUID_AQUI pelo valor retornado

-- Criar usuário administrador da prefeitura
-- A senha deve ser hasheada com bcrypt (a API faz isso)
-- Para o seed inicial, use a API POST /api/auth/setup ou insira diretamente:
INSERT INTO users (
  id,
  tenant_id,
  name,
  email,
  role,
  active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'TENANT_UUID_AQUI',
  'Administrador',
  'admin@exemplo.prefeitura.gov.br',
  'admin',
  true,
  now(),
  now()
);
```

> **Atenção:** Use o tenant `exemplolandia` para testes e exemplos internos. Não crie tenants descartáveis com dados de clientes reais. Ver `docs/tenant-padrao-testes.md` nas memórias do projeto.

### 4.8 Configurar DNS e Domínio

```bash
# Obter o DNS do ALB
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names portal-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text)
echo "ALB DNS: $ALB_DNS"

# Obter o Hosted Zone ID do ALB (necessário para registro ALIAS)
ALB_ZONE=$(aws elbv2 describe-load-balancers \
  --names portal-alb \
  --query 'LoadBalancers[0].CanonicalHostedZoneId' \
  --output text)

# Criar registros no Route 53
# Substitua HOSTED_ZONE_ID pelo ID da sua zona no Route 53
HOSTED_ZONE_ID="Z1234567890ABC"

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "*.prefeitura.gov.br",
          "Type": "A",
          "AliasTarget": {
            "DNSName": "'"$ALB_DNS"'",
            "EvaluateTargetHealth": true,
            "HostedZoneId": "'"$ALB_ZONE"'"
          }
        }
      },
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "prefeitura.gov.br",
          "Type": "A",
          "AliasTarget": {
            "DNSName": "'"$ALB_DNS"'",
            "EvaluateTargetHealth": true,
            "HostedZoneId": "'"$ALB_ZONE"'"
          }
        }
      }
    ]
  }'
```

A propagação DNS pode levar até 5 minutos dentro da AWS e até 48 horas para resolvedores externos. Após a propagação, o certificado ACM já está válido (foi validado via CNAME na etapa de criação).

> **Atenção:** Se o domínio for `.gov.br`, o registro e a configuração de DNS envolvem a RNDS (Rede Nacional de DNS do Governo) e pode exigir aprovação da SERPRO. Inicie esse processo com antecedência — o domínio `.gov.br` tem prazos de delegação que variam de dias a semanas.

### 4.9 Smoke Test

Após DNS propagado e containers saudáveis no ECS:

```bash
# Health check da API
curl -f https://api.prefeitura.gov.br/api/health/ready
# Esperado: HTTP 200 com body {"status":"ok"} ou {"status":"ok","checks":{...}}

# Verificar que o portal web responde
curl -f -o /dev/null -w "%{http_code}" https://exemplo.prefeitura.gov.br/
# Esperado: 200

# Verificar redirecionamento HTTP → HTTPS
curl -I http://exemplo.prefeitura.gov.br/
# Esperado: 301 Location: https://...

# Verificar que o health check do ALB está passando
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw api_target_group_arn)
# Esperado: "State": {"Code": "healthy"}

# Verificar logs da API (últimos 50 eventos)
aws logs tail /ecs/portal-api --follow --since 5m
```

Se o health check retornar 503 ou a task não subir, consulte a seção [6.1 Problemas Comuns](#61-problemas-comuns).

---

## 5. Operações

### 5.1 Backups

**RDS (PostgreSQL):**

O RDS cria backups automáticos diariamente na janela configurada. Configure:

| Parâmetro | Dev | Prod |
|-----------|-----|------|
| Retenção de backups automáticos | 7 dias | 35 dias |
| Janela de backup | 03:00–04:00 UTC | 02:00–03:00 UTC (madrugada horário de Brasília) |
| Multi-AZ | Não | Sim |
| PITR (Point-in-Time Recovery) | Disponível | Habilitado e documentado no runbook |

Antes de qualquer deploy com migrations DDL, crie um snapshot manual:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier portal-db \
  --db-snapshot-identifier "portal-pre-deploy-$(date +%Y%m%d-%H%M)" \
  --region us-east-1
```

Para restaurar a partir de um snapshot:

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier portal-db-restored \
  --db-snapshot-identifier portal-pre-deploy-20260616-1430 \
  --db-instance-class db.t3.medium \
  --no-publicly-accessible
```

**S3 (Object Storage):**

O versioning habilitado na etapa 4.2 garante que sobrescritas e deleções são reversíveis. Para proteção adicional contra deleção acidental da conta:

```bash
# Habilitar Object Lock (proteção por período mínimo)
# Atenção: Object Lock deve ser habilitado na criação do bucket
# Configure a política de ciclo de vida para objetos antigos

aws s3api put-bucket-lifecycle-configuration \
  --bucket portal \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "ExpireOldVersions",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
    }]
  }'
```

**ElastiCache (Redis):**

O ElastiCache tem snapshots automáticos. Configure:

```bash
aws elasticache modify-replication-group \
  --replication-group-id portal-redis \
  --snapshot-retention-limit 7 \
  --snapshot-window "04:00-05:00"
```

> **Atenção:** Os dados no Redis (filas BullMQ, cache de sessão) são efêmeros por design. Em caso de falha total do ElastiCache, as filas pendentes são perdidas mas o sistema se recupera automaticamente quando os workers reconectam. Sessões ativas são invalidadas — usuários precisam fazer login novamente.

### 5.2 Logs

**CloudWatch Log Groups:**

| Log Group | Conteúdo | Retenção recomendada |
|-----------|----------|----------------------|
| `/ecs/portal-api` | Logs de aplicação NestJS (requests, erros, workers, audit_log) | 30 dias |
| `/ecs/portal-web` | Logs do servidor Next.js (SSR errors, requests) | 14 dias |
| `/aws/rds/instance/portal-db/postgresql` | Logs lentos do PostgreSQL (slow queries) | 7 dias |
| `/aws/elasticache/portal-redis` | Logs de conexão e comandos Redis | 7 dias |

```bash
# Ver logs em tempo real da API
aws logs tail /ecs/portal-api --follow

# Buscar erros nas últimas 2 horas
aws logs filter-log-events \
  --log-group-name /ecs/portal-api \
  --filter-pattern "ERROR" \
  --start-time $(date -d "2 hours ago" +%s000) \
  --query 'events[].message' \
  --output text

# CloudWatch Logs Insights — query de erros de RLS
# No console CloudWatch → Logs Insights:
# fields @timestamp, @message
# | filter @message like /RLS|tenant_id|BYPASSRLS/
# | sort @timestamp desc
# | limit 100
```

### 5.3 Monitoramento e Alertas

Configure CloudWatch Alarms para os indicadores críticos:

```bash
# CPU da ECS Task (API) > 80% por 5 minutos
aws cloudwatch put-metric-alarm \
  --alarm-name "portal-api-cpu-high" \
  --alarm-description "CPU da API acima de 80%" \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=portal-cluster Name=ServiceName,Value=portal-api \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:portal-alerts

# RDS CPU > 80% por 5 minutos
aws cloudwatch put-metric-alarm \
  --alarm-name "portal-rds-cpu-high" \
  --alarm-description "CPU do RDS acima de 80%" \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=portal-db \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:portal-alerts

# ALB 5xx > 10 por minuto
aws cloudwatch put-metric-alarm \
  --alarm-name "portal-alb-5xx-high" \
  --alarm-description "Erros 5xx no ALB acima do threshold" \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_ELB_5XX_Count \
  --dimensions Name=LoadBalancer,Value=app/portal-alb/XXXX \
  --statistic Sum \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:portal-alerts

# ElastiCache evictions > 0 (sinal de pressão de memória)
aws cloudwatch put-metric-alarm \
  --alarm-name "portal-redis-evictions" \
  --alarm-description "ElastiCache expulsando chaves por pressão de memória" \
  --namespace AWS/ElastiCache \
  --metric-name Evictions \
  --dimensions Name=ReplicationGroupId,Value=portal-redis \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 0 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT:portal-alerts
```

Configure o SNS Topic `portal-alerts` para enviar e-mails ou integrar com PagerDuty/OpsGenie para on-call.

**Métricas customizadas da aplicação:**

A API expõe `/metrics` (protegido por `METRICS_TOKEN`) no formato Prometheus. Para coletar:

- Configure um container `prometheus` na task definition ou use Amazon Managed Prometheus
- Importe o dashboard Grafana para visualizar filas BullMQ, latência de requests e audit_log

### 5.4 Estimativa de Custos

Valores de referência para `us-east-1` (Norte da Virgínia). Preços de junho de 2026 — consulte a calculadora AWS para valores atuais.

**Pequeno porte (desenvolvimento + homologação ou prefeitura pequena):**

| Serviço | Especificação | Custo/mês estimado (USD) |
|---------|---------------|--------------------------|
| ECS Fargate (API) | 1024 CPU / 2048 MB, 730h | ~$30–40 |
| ECS Fargate (Web) | 512 CPU / 1024 MB, 730h | ~$15–20 |
| RDS db.t3.medium | PostgreSQL 16, 50 GB gp3, Single-AZ | ~$50–60 |
| ElastiCache cache.t3.micro | Redis 7, 1 nó | ~$15–20 |
| ALB | Por hora + LCUs | ~$18–25 |
| NAT Gateway | Por hora + tráfego (~10 GB) | ~$35–40 |
| S3 (portal) | 50 GB + 10 GB transferência | ~$5–10 |
| ECR | 2 repos, ~2 GB | ~$0.20 |
| Secrets Manager | ~10 segredos | ~$0.40 |
| CloudWatch | Logs + Alarms | ~$5–10 |
| ACM | Gratuito com ALB | $0 |
| **Total estimado** | | **~$170–$230/mês** |

**Produção (Multi-AZ, alta disponibilidade):**

| Serviço | Especificação | Custo/mês estimado (USD) |
|---------|---------------|--------------------------|
| ECS Fargate (API, 2 tasks) | 1024 CPU / 2048 MB cada | ~$60–80 |
| ECS Fargate (Web, 2 tasks) | 512 CPU / 1024 MB cada | ~$30–40 |
| RDS db.r6g.large | PostgreSQL 16, 100 GB gp3, Multi-AZ | ~$250–300 |
| ElastiCache cache.r6g.large | Redis 7, 2 nós (primary + replica) | ~$100–130 |
| ALB | Por hora + LCUs (carga maior) | ~$25–40 |
| NAT Gateway | Por hora + tráfego (~50 GB) | ~$50–70 |
| WAF v2 | Web ACL + regras managed + requests | ~$20–35 |
| S3 (portal) | 200 GB + 50 GB transferência | ~$15–25 |
| CloudWatch | Logs + Metrics + Alarms | ~$15–25 |
| CloudFront (opcional) | Cache de assets estáticos | ~$15–30 |
| **Total estimado** | | **~$580–$780/mês** |

> **Atenção:** O NAT Gateway tem custo significativo por hora (fixo ~$32/mês) mais custo por GB processado. Para reduzir, use VPC Endpoints para S3 (gratuito) e Secrets Manager — o tráfego vai pela rede interna da AWS sem passar pelo NAT.

```bash
# Criar VPC Endpoint para S3 (elimina tráfego S3 via NAT)
aws ec2 create-vpc-endpoint \
  --vpc-id VPC_ID \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids PRIVATE_ROUTE_TABLE_IDS \
  --vpc-endpoint-type Gateway

# Criar VPC Endpoint para Secrets Manager (reduz tráfego NAT)
aws ec2 create-vpc-endpoint \
  --vpc-id VPC_ID \
  --service-name com.amazonaws.us-east-1.secretsmanager \
  --vpc-endpoint-type Interface \
  --subnet-ids PRIVATE_SUBNET_IDS \
  --security-group-ids ECS_SG_ID \
  --private-dns-enabled
```

### 5.5 Deploy de Atualizações

O fluxo padrão de deploy de uma nova release:

```bash
# 1. Determinar a tag da nova release
NEW_TAG=$(git rev-parse --short HEAD)
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"

# 2. Build e push das novas imagens
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_BASE

docker build -t $ECR_BASE/portal/api:$NEW_TAG ./api
docker push $ECR_BASE/portal/api:$NEW_TAG

docker build -t $ECR_BASE/portal/web:$NEW_TAG ./web
docker push $ECR_BASE/portal/web:$NEW_TAG

# 3. Se houver novas migrations: APLICAR ANTES de atualizar o serviço ECS
# (o schema novo deve existir antes de a nova versão da API subir)
# Conecte ao RDS via bastion/ECS task e rode as migrations novas:
for f in $(ls db/0{60,61,62}*.sql db/0{63..99}*.sql 2>/dev/null | sort); do
  echo "Aplicando migration nova: $f"
  psql "$DATABASE_URL" -f "$f"
done

# 4a. Via Terraform (rastreia o estado da infraestrutura — preferido)
cd infra/terraform/aws
terraform apply \
  -var-file=environments/prod.tfvars \
  -var="image_tag_api=$NEW_TAG" \
  -var="image_tag_web=$NEW_TAG"

# 4b. Via AWS CLI (deploy rápido sem alterar outros recursos)
# Atualiza a task definition com a nova tag e força novo deployment
aws ecs update-service \
  --cluster portal-cluster \
  --service portal-api \
  --force-new-deployment \
  --region us-east-1

aws ecs update-service \
  --cluster portal-cluster \
  --service portal-web \
  --force-new-deployment \
  --region us-east-1

# 5. Aguardar o deployment estabilizar
aws ecs wait services-stable \
  --cluster portal-cluster \
  --services portal-api portal-web \
  --region us-east-1

echo "Deploy concluído."

# 6. Smoke test pós-deploy
curl -f https://api.prefeitura.gov.br/api/health/ready
```

**Rollback rápido:**

```bash
# Reverter para a tag anterior (mantida no ECR pelas lifecycle rules)
PREVIOUS_TAG="SHA_ANTERIOR"

aws ecs update-service \
  --cluster portal-cluster \
  --service portal-api \
  --task-definition portal-api:PREVIOUS_REVISION \
  --force-new-deployment

aws ecs wait services-stable \
  --cluster portal-cluster \
  --services portal-api \
  --region us-east-1
```

> **Atenção:** Rollback de migrations DDL (schema reversal) é um procedimento manual que requer análise caso a caso. Se a migration adicionou colunas, o rollback da aplicação para a versão anterior é seguro (colunas extras são ignoradas pelo Prisma). Se a migration removeu colunas ou alterou tipos, o rollback exige um script SQL de reversão aplicado antes de fazer rollback do container.

---

## 6. Troubleshooting e Checklist de Segurança

### 6.1 Problemas Comuns

**"RLS bypass" — dados de outros tenants visíveis:**

Sintoma: uma requisição retorna dados de tenants que não deveriam ser visíveis.

Diagnóstico:
```sql
-- Verificar qual role está sendo usada
SELECT current_user, session_user;

-- Verificar se a role tem BYPASSRLS
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('portal_app', 'portal_ro');
-- Ambas devem retornar rolbypassrls = false

-- Verificar se o current_tenant_id está sendo setado
SHOW app.current_tenant_id;
-- Deve retornar o UUID do tenant ativo
```

Solução: verifique que `DATABASE_URL` aponta para `portal_app`, não para o master user. O `PrismaService` deve chamar `SET app.current_tenant_id = '...'` no início de cada transação.

**"Connection refused" ao RDS (port 5432):**

Sintoma: `ECONNREFUSED` ou `timeout` ao conectar ao banco.

Diagnóstico:
```bash
# Verificar se o security group da ECS task permite saída para a porta 5432
aws ec2 describe-security-groups --group-ids ECS_SG_ID \
  --query 'SecurityGroups[0].IpPermissionsEgress'

# Verificar se o security group do RDS aceita entrada da ECS
aws ec2 describe-security-groups --group-ids RDS_SG_ID \
  --query 'SecurityGroups[0].IpPermissions'
# Deve conter: FromPort 5432, ToPort 5432, UserIdGroupPairs com o ID do ECS SG
```

Solução: adicionar regra de ingress no security group do RDS permitindo TCP 5432 do security group da ECS.

**"Cannot connect to Redis" (port 6379):**

Sintoma: BullMQ não processa filas, workers ficam em modo desconectado.

Diagnóstico:
```bash
# Verificar endpoint do ElastiCache
aws elasticache describe-replication-groups \
  --replication-group-id portal-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint'

# Verificar security group
aws ec2 describe-security-groups --group-ids REDIS_SG_ID \
  --query 'SecurityGroups[0].IpPermissions'
```

Solução: verificar que `REDIS_HOST` aponta para o endpoint primário (não o endpoint de configuração), que `REDIS_TLS=true` está configurado, que o `REDIS_PASSWORD` corresponde ao `auth_token` do ElastiCache, e que o security group do Redis aceita TCP 6379 da ECS.

**"S3 403 Forbidden":**

Sintoma: uploads falham com `AccessDenied` ou `403`.

Diagnóstico:
```bash
# Testar acesso S3 com as credenciais do app
AWS_ACCESS_KEY_ID=STORAGE_ACCESS_KEY \
AWS_SECRET_ACCESS_KEY=STORAGE_SECRET_KEY \
aws s3 ls s3://portal/ --region us-east-1
```

Soluções:
- Verificar que a IAM policy do usuário S3 inclui as actions necessárias no bucket `portal`
- Verificar que `STORAGE_FORCE_PATH_STYLE=false` (não `true` — esse é o modo MinIO)
- Verificar que `STORAGE_REGION` corresponde à região onde o bucket foi criado
- Verificar que o bucket `portal` existe e não tem políticas de bloqueio adicional

**"Health check failing" — task reiniciando em loop:**

Sintoma: `ecs:task:STOPPED` repetidamente nos eventos do serviço; health check no ALB em `unhealthy`.

Diagnóstico:
```bash
# Ver o motivo da parada da task
aws ecs describe-tasks \
  --cluster portal-cluster \
  --tasks TASK_ARN \
  --query 'tasks[0].stoppedReason'

# Ver logs da task que parou
aws logs get-log-events \
  --log-group-name /ecs/portal-api \
  --log-stream-name ecs/portal-api/TASK_ID \
  --limit 50
```

Causas comuns:
- `DATABASE_URL` inválida (banco não acessível no momento da subida)
- Segredo não encontrado no Secrets Manager (permissão negada na execution role)
- Porta errada no health check (deve ser 3001 para a API, não 3000)
- Container saindo com exit code não-zero por erro de inicialização

**"Migrations falhando na migration 001":**

Sintoma: `ERROR: extension "postgis" does not exist` ou `ERROR: extension "uuid-ossp" does not exist`.

Solução: a migration 001 (`db/001_extensions_tenancy_rls.sql`) cria extensões e configura RLS. Ela precisa que `postgis` e `uuid-ossp` já existam no banco (criados na etapa 4.4 como master user, pois `CREATE EXTENSION` requer superuser). Rode a etapa 4.4 completa antes de iniciar as migrations.

**"Migrations falhando por permissão":**

Sintoma: `ERROR: permission denied for table ...` ao rodar migrations como `portal_app`.

Solução: as migrations DDL (`CREATE TABLE`, `ALTER TABLE`, `CREATE POLICY`) devem ser rodadas como master user (que tem `CREATEROLE` e `DDL` rights). Depois das migrations, o `portal_app` recebe `GRANT SELECT, INSERT, UPDATE, DELETE` conforme etapa 4.5.

**"ECS task não encontra imagem ECR":**

Sintoma: `CannotPullContainerError: pull access denied`.

Solução: verificar que a execution role da task tem a policy `AmazonECRReadOnly` ou permissões equivalentes (`ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:GetAuthorizationToken`), e que o repositório ECR está na mesma conta/região.

### 6.2 Checklist de Segurança

Revise este checklist antes de declarar o ambiente de produção pronto para go-live.

**Segredos e credenciais:**
- [ ] Todos os segredos estão no Secrets Manager, não em variáveis de ambiente plaintext na task definition
- [ ] Nenhum segredo está commitado no git (rode `git log --all -S "AUTH_JWT_SECRET"` para verificar)
- [ ] `AUTH_JWT_SECRET` tem pelo menos 32 caracteres aleatórios
- [ ] `CPF_PEPPER` foi gerado com `openssl rand -hex 32` e nunca será alterado (mudança invalida todas as deduplicações LGPD de CPF)
- [ ] O IAM User do S3 tem apenas as permissões mínimas (sem `s3:*` ou `*` na policy)
- [ ] O master user do RDS não está em nenhuma variável de ambiente da aplicação
- [ ] MFA habilitado na conta root AWS

**Rede e isolamento:**
- [ ] Security groups mínimos: ECS task só aceita tráfego do ALB (ingress 3001/3000 do ALB SG); sem ingress de `0.0.0.0/0`
- [ ] RDS sem acesso público (`PubliclyAccessible=false`) e SG aceita apenas da ECS
- [ ] ElastiCache sem acesso público e SG aceita apenas da ECS
- [ ] Subnets privadas para ECS, RDS e ElastiCache (sem IP público nos recursos)
- [ ] NAT Gateway para saída dos containers (sem rotas diretas para IGW das subnets privadas)
- [ ] VPC Endpoints para S3 e Secrets Manager (reduz custo do NAT e elimina tráfego externo)

**TLS e certificados:**
- [ ] ALB com listener HTTPS (443) usando certificado ACM wildcard
- [ ] Listener HTTP (80) redireciona para HTTPS (301) — sem acesso HTTP em produção
- [ ] ElastiCache com `transit_encryption_enabled = true` (`REDIS_TLS=true`)
- [ ] `STORAGE_FORCE_PATH_STYLE=false` com S3 nativo

**WAF e proteção:**
- [ ] WAF v2 associado ao ALB
- [ ] Regra `AWSManagedRulesCommonRuleSet` habilitada
- [ ] Rate limiting por IP configurado (threshold adequado para uso da prefeitura)
- [ ] CloudTrail habilitado para auditoria de chamadas à API AWS

**RLS e isolamento multi-tenant:**
- [ ] `portal_app` é `NOSUPERUSER` e `NOBYPASSRLS` (verificar com `SELECT rolbypassrls FROM pg_roles WHERE rolname='portal_app'` → `false`)
- [ ] `portal_ro` é `NOSUPERUSER` e `NOBYPASSRLS`
- [ ] `PrismaService` seta `app.current_tenant_id` antes de qualquer query
- [ ] Nenhum endpoint público retorna dados sem resolver o tenant do header `Host`
- [ ] Teste de isolamento RLS executado (ver `docs/adr/0001-multi-tenancy-rls.md` e memórias do projeto)

**S3 e storage:**
- [ ] Bucket `portal` com acesso público bloqueado (todas as 4 flags de bloqueio ativas)
- [ ] SSE-S3 ou SSE-KMS habilitado
- [ ] Versioning habilitado
- [ ] Lifecycle policy para expirar versões antigas (90 dias)
- [ ] Nenhuma URL pública de objeto (todos os arquivos servidos via API)

**Rotação e manutenção:**
- [ ] Rotação automática de segredos configurada no Secrets Manager (opcional mas recomendado)
- [ ] CloudWatch Alarms configurados para CPU, RDS, Redis, ALB 5xx
- [ ] SNS Topic de alertas com e-mail ou integração de on-call
- [ ] Backup automático do RDS verificado (snapshot de teste restaurado com sucesso)
- [ ] Processo de rollback documentado e testado em homologação antes do go-live

**Acessibilidade e conformidade (não técnico mas obrigatório):**
- [ ] Portal passa no contraste WCAG AA com o tema da prefeitura (regra inviolável 3 do `CLAUDE.md`)
- [ ] VLibras carregado no portal web
- [ ] Prazos ESIC (20+10 dias) e Ouvidoria (30+30 dias) configurados e testados
- [ ] Política de privacidade e LGPD vinculadas ao portal

---

*Documento mantido pela equipe Lidera. Para dúvidas sobre a arquitetura, consulte `docs/01-arquitetura.md`. Para o ambiente Servidor Lidera (Docker em WSL2), consulte `docs/instalacao/03-docker.md` e `docs/12-infraestrutura.md`. Para registro de decisões estruturais, consulte `docs/adr/`.*
