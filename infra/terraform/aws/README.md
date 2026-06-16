# Infraestrutura AWS — Portal de Prefeitura

Terraform para provisionar a infraestrutura AWS do Portal de Prefeitura (plataforma SaaS multi-tenant).

## Arquitetura

```
Internet → ALB (HTTPS + WAF) → ECS Fargate
                                ├── API NestJS  (porta 3001)  → RDS PostgreSQL 16 + PostGIS
                                └── Web Next.js (porta 3000)  → ElastiCache Redis 7
                                                               → S3 (storage)
                                                               → Secrets Manager
```

Roteamento multi-tenant via `Host` header: `*.suaprefeitura.gov.br` → Web, `api.suaprefeitura.gov.br` → API.

---

## 1. Pré-requisitos

- **AWS CLI** >= 2.x configurado com credenciais (`aws configure`)
- **Terraform** >= 1.5 ([instalar](https://developer.hashicorp.com/terraform/downloads))
- **Docker** (para build e push das imagens)
- **psql** (para rodar as migrations após o apply)
- Conta AWS com permissões para criar: VPC, ECS, RDS, ElastiCache, S3, IAM, ACM, WAF

---

## 2. Ordem de criação dos recursos

O ECS precisa das imagens no ECR antes de subir as tasks. Siga esta ordem:

```bash
# Passo 1: criar somente o ECR
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.web

# Passo 2: autenticar e fazer push das imagens
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(terraform output -raw ecr_api_url | cut -d'/' -f1)

docker build -t $(terraform output -raw ecr_api_url):latest ../../api
docker push $(terraform output -raw ecr_api_url):latest

docker build -t $(terraform output -raw ecr_web_url):latest ../../web
docker push $(terraform output -raw ecr_web_url):latest

# Passo 3: apply completo
terraform apply
```

---

## 3. Inicialização e deploy

```bash
# Copiar e preencher as variáveis
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars com os valores reais

# Inicializar o Terraform (baixa providers, configura backend)
terraform init

# Revisar o plano de execução (sem criar nada)
terraform plan

# Criar a infraestrutura
terraform apply
```

Para usar o backend S3 (recomendado em produção), crie o bucket de state manualmente
e descomente o bloco `backend "s3"` em `versions.tf`.

---

## 4. Pós-apply: popular o Secrets Manager

Após o `terraform apply`, popule cada segredo com os valores reais:

```bash
# Gerar e salvar o JWT secret
JWT_SECRET=$(openssl rand -base64 64)
aws secretsmanager put-secret-value \
  --secret-id portal/auth-jwt-secret \
  --secret-string "$JWT_SECRET"

# CPF Pepper
CPF_PEPPER=$(openssl rand -base64 32)
aws secretsmanager put-secret-value \
  --secret-id portal/cpf-pepper \
  --secret-string "$CPF_PEPPER"

# DATABASE_URL (use o endpoint do RDS do output)
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
aws secretsmanager put-secret-value \
  --secret-id portal/database-url \
  --secret-string "postgresql://portal_app:SENHA_APP@${RDS_ENDPOINT}/portal?sslmode=require"

aws secretsmanager put-secret-value \
  --secret-id portal/database-url-readonly \
  --secret-string "postgresql://portal_ro:SENHA_RO@${RDS_ENDPOINT}/portal?sslmode=require"

# Redis password (mesmo valor de var.redis_auth_token)
aws secretsmanager put-secret-value \
  --secret-id portal/redis-password \
  --secret-string "SEU_REDIS_AUTH_TOKEN"

# Credenciais S3 (gere e salve)
ACCESS_KEY_JSON=$(aws iam create-access-key --user-name portal-prefeitura-s3-app)
aws secretsmanager put-secret-value \
  --secret-id portal/storage-access-key \
  --secret-string "$(echo $ACCESS_KEY_JSON | jq -r .AccessKey.AccessKeyId)"
aws secretsmanager put-secret-value \
  --secret-id portal/storage-secret-key \
  --secret-string "$(echo $ACCESS_KEY_JSON | jq -r .AccessKey.SecretAccessKey)"

# API Anthropic
aws secretsmanager put-secret-value \
  --secret-id portal/anthropic-api-key \
  --secret-string "sk-ant-XXXXXXXXXX"

# gov.br (obtidos no portal de serviços gov.br)
aws secretsmanager put-secret-value \
  --secret-id portal/govbr-client-id \
  --secret-string "SEU_CLIENT_ID_GOVBR"
aws secretsmanager put-secret-value \
  --secret-id portal/govbr-client-secret \
  --secret-string "SEU_CLIENT_SECRET_GOVBR"

# SMTP
aws secretsmanager put-secret-value \
  --secret-id portal/smtp-pass \
  --secret-string "SUA_SENHA_SMTP"

# Diário Oficial (chave ICP-Brasil — gate de produção)
aws secretsmanager put-secret-value \
  --secret-id portal/diario-signing-key \
  --secret-string "$(cat /caminho/para/chave-icp.pem)"
```

---

## 5. Configuração do banco de dados

Conecte ao RDS via Session Manager (sem abrir porta pública):

```bash
# Iniciar sessão SSM no bastion ou usar RDS Proxy
aws ssm start-session --target <INSTANCE_ID>

# Dentro da sessão:
psql "postgresql://portalmaster:SENHA@$(terraform output -raw rds_endpoint)/portal"
```

### Extensões (executar uma vez como master user):

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;  -- RAG semântico (pgvector)
```

### Criar roles da aplicação:

```sql
CREATE ROLE portal_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  LOGIN PASSWORD 'SENHA_FORTE_APP';

CREATE ROLE portal_ro NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  LOGIN PASSWORD 'SENHA_FORTE_RO';

GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
```

---

## 6. Rodar as 62 migrations

```bash
# Bash/Linux/macOS
export DATABASE_URL="postgresql://portal_app:SENHA@RDS_ENDPOINT:5432/portal?sslmode=require"
for f in $(ls ../../db/*.sql | sort); do
  echo "Aplicando: $f"
  psql "$DATABASE_URL" -f "$f"
done

# PowerShell (Windows)
$env:DATABASE_URL = "postgresql://portal_app:SENHA@RDS_ENDPOINT:5432/portal?sslmode=require"
Get-ChildItem ..\..\db\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "Aplicando: $($_.Name)"
  psql $env:DATABASE_URL -f $_.FullName
}
```

As migrations são numeradas de 001 a 062 e devem ser aplicadas em ordem.

---

## 7. Configurar DNS

Após o apply, pegue o DNS do ALB e configure no seu provedor DNS:

```bash
terraform output alb_dns_name
# Saída: portal-prefeitura-alb-XXXXXXX.us-east-1.elb.amazonaws.com
```

Configure os CNAMEs (Cloudflare, Route 53, etc.):

```
CNAME  suaprefeitura.gov.br         → <alb_dns_name>
CNAME  *.suaprefeitura.gov.br       → <alb_dns_name>
CNAME  api.suaprefeitura.gov.br     → <alb_dns_name>
```

---

## 8. Forçar novo deployment (após push de nova imagem)

```bash
# Forçar redeploy da API
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_api_name) \
  --force-new-deployment

# Forçar redeploy do Web
aws ecs update-service \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --service $(terraform output -raw ecs_service_web_name) \
  --force-new-deployment

# Aguardar estabilização
aws ecs wait services-stable \
  --cluster $(terraform output -raw ecs_cluster_name) \
  --services $(terraform output -raw ecs_service_api_name)
```

---

## 9. Destroy (cuidado!)

O RDS tem `deletion_protection = true`. Para destruir:

```bash
# Passo 1: desabilitar proteção de exclusão do RDS
terraform apply -var="db_deletion_protection=false"  # ou editar database.tf manualmente

# Passo 2: esvaziar o bucket S3 (obrigatório para destruir)
aws s3 rm s3://$(terraform output -raw s3_bucket_name) --recursive

# Passo 3: destruir tudo
terraform destroy
```

**AVISO:** `terraform destroy` elimina TODA a infraestrutura, incluindo o banco de dados.
Certifique-se de ter um backup antes de prosseguir.

---

## 10. Custo estimado (us-east-1, 2025)

| Recurso                      | Tipo              | Custo/mês (aprox.) |
|------------------------------|-------------------|--------------------|
| ECS Fargate API (1x 1vCPU/2GB) | Fargate          | ~$30               |
| ECS Fargate Web (1x 0.5vCPU/1GB) | Fargate        | ~$12               |
| RDS PostgreSQL db.t3.medium  | RDS               | ~$55               |
| ElastiCache cache.t3.micro   | ElastiCache       | ~$14               |
| ALB                          | Application LB    | ~$20               |
| NAT Gateway                  | NAT GW            | ~$35               |
| S3 (10 GB + transferência)   | S3                | ~$5                |
| CloudWatch Logs (30 dias)    | CloudWatch        | ~$5                |
| Secrets Manager (12 segredos)| Secrets Manager   | ~$6                |
| WAF (WebACL + regras)        | WAFv2             | ~$10               |
| **Total estimado**           |                   | **~$192/mês**      |

_Estimativa para 1 tenant em produção com carga baixa. Sem Reserved Instances._
_Reduza custos em staging: use db.t3.micro, cache.t3.micro, 1 AZ, sem WAF._

---

## 11. Estrutura dos arquivos

```
infra/terraform/aws/
├── versions.tf              # Versões do Terraform e provider AWS
├── variables.tf             # Todas as variáveis de entrada
├── network.tf               # VPC, subnets, IGW, NAT, SGs
├── database.tf              # RDS PostgreSQL 16 + PostGIS
├── redis.tf                 # ElastiCache Redis 7
├── storage.tf               # S3 bucket + lifecycle + SSE
├── secrets.tf               # Secrets Manager (sem valores reais)
├── ecr.tf                   # Repositórios ECR (API + Web)
├── iam.tf                   # Roles ECS (execution + task) + IAM user S3
├── alb.tf                   # ALB + target groups + listeners + WAF
├── ecs.tf                   # Cluster ECS + task definitions + services
├── outputs.tf               # Outputs pós-apply
├── terraform.tfvars.example # Exemplo de configuração (sem secrets)
└── README.md                # Este arquivo
```
