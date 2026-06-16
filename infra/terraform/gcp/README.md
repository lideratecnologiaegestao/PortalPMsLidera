# Terraform GCP — Portal de Prefeitura

Infraestrutura como código (IaC) para provisionar o Portal de Prefeitura (SaaS multi-tenant) no Google Cloud Platform usando Terraform.

## Arquitetura provisionada

- **Cloud Run**: portal-api (NestJS :3001) e portal-web (Next.js :3000)
- **Cloud SQL**: PostgreSQL 16 com PostGIS, IP privado, PITR habilitado
- **Memorystore**: Redis 7 STANDARD_HA para BullMQ e cache
- **Cloud Storage**: bucket `portal` com interoperabilidade S3 (HMAC keys)
- **Secret Manager**: todos os segredos injetados via referência (sem plaintext)
- **Cloud Load Balancing**: HTTPS com certificado gerenciado + Cloud Armor WAF
- **Artifact Registry**: repositório Docker privado
- **VPC privada**: Cloud SQL e Redis sem IP público; Cloud Run via VPC Connector

## 1. Pré-requisitos

### Ferramentas

```bash
# gcloud CLI >= 450.0
gcloud --version

# Terraform >= 1.5
terraform --version

# Docker (para build das imagens)
docker --version

# psql (para rodar migrations)
psql --version

# Cloud SQL Auth Proxy v2
curl -L https://dl.google.com/cloudsql/cloud-sql-proxy.linux.amd64 -o cloud-sql-proxy
chmod +x cloud-sql-proxy
```

### Autenticação GCP

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project SEU_PROJECT_ID
```

### APIs habilitadas

```bash
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com \
  servicenetworking.googleapis.com vpcaccess.googleapis.com \
  redis.googleapis.com storage.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com compute.googleapis.com \
  certificatemanager.googleapis.com cloudresourcemanager.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com
```

## 2. Configuração inicial

```bash
# 1. Entrar no diretório
cd infra/terraform/gcp

# 2. Copiar e editar as variáveis
cp terraform.tfvars.example terraform.tfvars
# Edite terraform.tfvars com os valores do seu projeto

# 3. Configurar senhas do banco via variáveis de ambiente
#    (NUNCA coloque senhas no terraform.tfvars)
export TF_VAR_db_password_app="$(openssl rand -base64 32)"
export TF_VAR_db_password_ro="$(openssl rand -base64 32)"

# Salve as senhas em algum lugar seguro antes de continuar!
echo "db_password_app: $TF_VAR_db_password_app"
echo "db_password_ro:  $TF_VAR_db_password_ro"
```

## 3. Terraform init, plan, apply

```bash
# Inicializar providers e módulos
terraform init

# Validar a configuração
terraform validate

# Gerar e revisar o plano de execução
terraform plan -out=tfplan

# Revisar o plano cuidadosamente antes de aplicar!
# O apply vai criar recursos que geram CUSTOS.

# Aplicar o plano (confirme com "yes")
terraform apply tfplan

# Salvar os outputs
terraform output -json > terraform-outputs.json
```

**Tempo estimado do primeiro apply:** 15–25 minutos (a maior parte é o Cloud SQL ~10 min).

## 4. Ordem de operações após o apply

Após o `terraform apply` concluir com sucesso:

### 4.1 Salvar o HMAC secret IMEDIATAMENTE

O HMAC secret do GCS é exibido apenas uma vez. Execute agora:

```bash
terraform output -raw hmac_secret | gcloud secrets versions add STORAGE_SECRET_KEY \
  --project=$(terraform output -raw project_id 2>/dev/null || echo "SEU_PROJECT_ID") \
  --data-file=-

terraform output -raw hmac_access_id | gcloud secrets versions add STORAGE_ACCESS_KEY \
  --project=SEU_PROJECT_ID \
  --data-file=-
```

### 4.2 Popular todos os segredos no Secret Manager

```bash
# IP do Redis
terraform output -raw redis_host | gcloud secrets versions add REDIS_HOST \
  --project=SEU_PROJECT_ID --data-file=-

# DATABASE_URL (substitua SENHA_APP pelo valor salvo no passo 2)
CLOUDSQL_IP=$(terraform output -raw cloud_sql_private_ip)
echo -n "postgresql://portal_app:${TF_VAR_db_password_app}@${CLOUDSQL_IP}:5432/portal?schema=public" \
  | gcloud secrets versions add DATABASE_URL --project=SEU_PROJECT_ID --data-file=-

echo -n "postgresql://portal_ro:${TF_VAR_db_password_ro}@${CLOUDSQL_IP}:5432/portal?schema=public" \
  | gcloud secrets versions add DATABASE_URL_READONLY --project=SEU_PROJECT_ID --data-file=-

# Segredos externos (substitua pelos valores reais)
echo -n "sk-ant-api03-SUA_CHAVE" | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
echo -n "SEU_GOVBR_CLIENT_SECRET" | gcloud secrets versions add GOVBR_CLIENT_SECRET --data-file=-
echo -n "SUA_SENHA_SMTP" | gcloud secrets versions add SMTP_PASSWORD --data-file=-

# JWT Secret (gerado automaticamente)
openssl rand -base64 48 | gcloud secrets versions add AUTH_JWT_SECRET \
  --project=SEU_PROJECT_ID --data-file=-

# CPF Pepper — SALVE ESTE VALOR. Nunca alterar após go-live.
CPF_PEPPER=$(openssl rand -base64 32)
echo "CPF_PEPPER: $CPF_PEPPER"  # SALVE ESTE VALOR!
echo -n "$CPF_PEPPER" | gcloud secrets versions add CPF_PEPPER \
  --project=SEU_PROJECT_ID --data-file=-
```

## 5. Rodar as migrations via Cloud SQL Auth Proxy

As 62 migrations SQL (`db/001_*.sql` → `db/062_*.sql`) devem ser aplicadas em ordem após o provisionamento do banco.

```bash
# Obter o connection name
INSTANCE_CONNECTION_NAME=$(terraform output -raw cloud_sql_connection_name)

# Iniciar o Cloud SQL Auth Proxy na porta local 5433
./cloud-sql-proxy "${INSTANCE_CONNECTION_NAME}" --port=5433 &
PROXY_PID=$!
sleep 3

# Criar extensões necessárias (requer usuário privilegiado)
PGPASSWORD="SENHA_DO_POSTGRES_PRIVILEGIADO" psql \
  "postgresql://postgres@127.0.0.1:5433/portal" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS vector;"

# Criar usuários da aplicação com flags corretas de RLS
PGPASSWORD="SENHA_DO_POSTGRES_PRIVILEGIADO" psql \
  "postgresql://postgres@127.0.0.1:5433/portal" \
  -c "ALTER ROLE portal_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER ROLE portal_ro NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;"

# Aplicar as 62 migrations em ordem
for f in $(ls ../../../db/*.sql | sort); do
  echo "Applying: $(basename $f)"
  PGPASSWORD="${TF_VAR_db_password_app}" psql \
    "postgresql://portal_app@127.0.0.1:5433/portal" \
    -f "$f"
  [ $? -ne 0 ] && echo "ERRO! Abortando." && kill $PROXY_PID && exit 1
done

echo "Migrations concluídas."

# Conceder permissões pós-migrations
PGPASSWORD="SENHA_PRIVILEGIADA" psql "postgresql://postgres@127.0.0.1:5433/portal" -c "
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_app;
"

# Encerrar o proxy
kill $PROXY_PID
```

## 6. Configurar o DNS

Após o apply, obtenha o IP do Load Balancer e configure o DNS:

```bash
LB_IP=$(terraform output -raw load_balancer_ip)
echo "Configure no seu DNS:"
echo "A  prefeitura.app.br   → $LB_IP"
echo "A  *.prefeitura.app.br → $LB_IP"
```

O certificado TLS será provisionado automaticamente em 15–60 minutos após o DNS propagar.

## 7. Verificar o deployment

```bash
BASE_URL="https://api.prefeitura.app.br"

# Readiness check
curl -sf "${BASE_URL}/api/health/ready" && echo "API OK"

# Portal web
curl -sf "https://exemplolandia.prefeitura.app.br" | grep -c "<html" && echo "WEB OK"
```

## 8. Destruir a infraestrutura

> **AVISO:** `terraform destroy` apaga TODOS os recursos, incluindo o banco de dados e todos os dados! Execute apenas em ambientes de desenvolvimento.

```bash
# ANTES de destruir: faça backup dos dados!
gcloud sql backups create --instance=portal-postgres \
  --description="Backup antes de destroy $(date)"

# Desabilitar proteção de deleção do Cloud SQL (necessário para destroy)
# Edite database.tf: deletion_protection = false
# Depois aplique: terraform apply

# Destruir todos os recursos
terraform destroy

# Confirme digitando "yes"
```

Para destruir apenas recursos específicos:

```bash
# Destruir apenas o Cloud Run (sem apagar dados)
terraform destroy -target=google_cloud_run_v2_service.api
terraform destroy -target=google_cloud_run_v2_service.web
```

## Estrutura dos arquivos

```
infra/terraform/gcp/
├── versions.tf            # Versões de Terraform e providers
├── variables.tf           # Definição de todas as variáveis
├── network.tf             # VPC, subnets, Private Service Access, NAT, VPC Connector
├── database.tf            # Cloud SQL PostgreSQL 16 + usuários
├── redis.tf               # Memorystore Redis 7
├── storage.tf             # Cloud Storage + HMAC keys
├── secrets.tf             # Secret Manager (recursos sem valores)
├── cloudrun.tf            # Cloud Run v2 (portal-api + portal-web)
├── artifact_registry.tf   # Repositório Docker privado
├── loadbalancer.tf        # HTTPS LB + Cloud Armor WAF + URL map
├── iam.tf                 # Service accounts e permissões
├── outputs.tf             # Outputs (IPs, URLs, connection names)
├── terraform.tfvars.example  # Exemplo de variáveis (sem segredos)
└── README.md              # Este arquivo
```

## Dicas de operação

- **State remoto:** descomente o bloco `backend "gcs"` em `versions.tf` e crie o bucket manualmente antes de `terraform init`.
- **Múltiplos ambientes:** use workspaces (`terraform workspace new staging`) ou diretórios separados por ambiente.
- **Custos:** monitore no [Cloud Billing](https://console.cloud.google.com/billing). Configure alertas de orçamento.
- **Rotação de segredos:** adicione novas versões no Secret Manager; o Cloud Run pega a versão `latest` automaticamente no próximo deploy.
- **Escala do Redis:** para escalar memória, é necessário recriar a instância (Memorystore não suporta resize in-place na maioria das configurações).
