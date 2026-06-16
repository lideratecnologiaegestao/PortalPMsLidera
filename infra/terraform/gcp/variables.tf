# ============================================================
# variables.tf — Variáveis do módulo Terraform GCP
# Portal de Prefeitura (SaaS multi-tenant)
# NUNCA coloque valores de segredo neste arquivo.
# Use Secret Manager para segredos (senhas, chaves de API).
# ============================================================

# ------------------------------------------------------------------
# Identificação do projeto
# ------------------------------------------------------------------

variable "project_id" {
  type        = string
  description = "ID do projeto GCP onde os recursos serão criados. Ex: portal-prefeitura-prod-123456"
}

variable "region" {
  type        = string
  default     = "us-east1"
  description = "Região GCP principal para provisionamento de recursos. Escolha próxima ao público-alvo (Brasil: us-east1 ou southamerica-east1)."
}

variable "zone" {
  type        = string
  default     = "us-east1-b"
  description = "Zona GCP para recursos zonais (ex: Cloud SQL). Deve ser uma zona dentro da região escolhida."
}

variable "environment" {
  type        = string
  default     = "production"
  description = "Ambiente de deployment. Valores válidos: production, staging, development."

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "O valor de environment deve ser: production, staging ou development."
  }
}

# ------------------------------------------------------------------
# Banco de dados — Cloud SQL (PostgreSQL 16 + PostGIS)
# ------------------------------------------------------------------

variable "db_tier" {
  type        = string
  default     = "db-custom-2-4096"
  description = "Tier (machine type) da instância Cloud SQL. db-custom-2-4096 = 2 vCPU + 4 GB RAM. Para produção inicial recomendado; escale conforme crescimento. Ver: https://cloud.google.com/sql/pricing"
}

variable "db_name" {
  type        = string
  default     = "portal"
  description = "Nome do banco de dados PostgreSQL a ser criado na instância Cloud SQL."
}

variable "db_user_app" {
  type        = string
  default     = "portal_app"
  description = "Nome do usuário PostgreSQL da aplicação (NOSUPERUSER NOBYPASSRLS). Usado pela API NestJS via DATABASE_URL."
}

variable "db_user_readonly" {
  type        = string
  default     = "portal_ro"
  description = "Nome do usuário PostgreSQL somente-leitura (NOSUPERUSER NOBYPASSRLS). Usado para relatórios e réplicas de leitura via DATABASE_URL_READONLY."
}

variable "db_password_app" {
  type        = string
  sensitive   = true
  description = "Senha do usuário portal_app. NUNCA coloque aqui — passe via -var='db_password_app=VALOR' ou variável de ambiente TF_VAR_db_password_app. Armazene a senha final no Secret Manager."
}

variable "db_password_ro" {
  type        = string
  sensitive   = true
  description = "Senha do usuário portal_ro. NUNCA coloque aqui — passe via -var='db_password_ro=VALOR' ou variável de ambiente TF_VAR_db_password_ro. Armazene a senha final no Secret Manager."
}

# ------------------------------------------------------------------
# Cache e filas — Memorystore for Redis 7
# ------------------------------------------------------------------

variable "redis_memory_gb" {
  type        = number
  default     = 1
  description = "Tamanho da memória do Memorystore Redis em GB. Monitore used_memory e escale conforme crescimento das filas BullMQ e cache de tenant."

  validation {
    condition     = var.redis_memory_gb >= 1 && var.redis_memory_gb <= 300
    error_message = "redis_memory_gb deve estar entre 1 e 300 GB."
  }
}

variable "redis_tier" {
  type        = string
  default     = "STANDARD_HA"
  description = "Tier do Memorystore Redis. STANDARD_HA: alta disponibilidade com failover automático (produção). BASIC: sem HA, mais barato (dev/staging)."

  validation {
    condition     = contains(["STANDARD_HA", "BASIC"], var.redis_tier)
    error_message = "redis_tier deve ser STANDARD_HA ou BASIC."
  }
}

# ------------------------------------------------------------------
# DNS e domínio
# ------------------------------------------------------------------

variable "domain" {
  type        = string
  description = "Domínio principal da plataforma. Ex: prefeitura.app.br. O wildcard *.dominio será configurado para multi-tenancy por subdomínio."
}

# ------------------------------------------------------------------
# Imagens Docker (Artifact Registry)
# ------------------------------------------------------------------

variable "image_api" {
  type        = string
  description = "Imagem Docker completa da API NestJS no Artifact Registry. Ex: us-east1-docker.pkg.dev/PROJECT_ID/portal/api:latest"
}

variable "image_web" {
  type        = string
  description = "Imagem Docker completa do portal Next.js no Artifact Registry. Ex: us-east1-docker.pkg.dev/PROJECT_ID/portal/web:latest"
}

# ------------------------------------------------------------------
# Cloud Run — escala
# ------------------------------------------------------------------

variable "min_instances_api" {
  type        = number
  default     = 1
  description = "Número mínimo de instâncias do Cloud Run para portal-api. Use 1 para evitar cold start em produção. Use 0 em dev para economizar."
}

variable "max_instances_api" {
  type        = number
  default     = 10
  description = "Número máximo de instâncias do Cloud Run para portal-api. Ajuste conforme carga esperada. Cada instância processa até 80 requisições simultâneas."
}

variable "min_instances_web" {
  type        = number
  default     = 1
  description = "Número mínimo de instâncias do Cloud Run para portal-web. Use 1 para evitar cold start em produção."
}

variable "max_instances_web" {
  type        = number
  default     = 10
  description = "Número máximo de instâncias do Cloud Run para portal-web."
}

# ------------------------------------------------------------------
# Cloud Storage (GCS)
# ------------------------------------------------------------------

variable "storage_bucket_name" {
  type        = string
  default     = "portal"
  description = "Nome do bucket Cloud Storage para uploads e assets. Será prefixado com o project_id para garantir unicidade global: {project_id}-{storage_bucket_name}."
}

variable "storage_location" {
  type        = string
  default     = "US"
  description = "Localização do bucket GCS. US: multi-region (maior disponibilidade, maior custo). us-east1: single-region (menor latência, menor custo). SOUTHAMERICA-EAST1: Brasil."
}

# ------------------------------------------------------------------
# Rede
# ------------------------------------------------------------------

variable "vpc_connector_cidr" {
  type        = string
  default     = "10.8.0.0/28"
  description = "CIDR /28 exclusivo para o Serverless VPC Access Connector. Não deve sobrepor outros ranges da VPC. O /28 suporta até 100 instâncias Cloud Run simultâneas."

  validation {
    condition     = can(cidrhost(var.vpc_connector_cidr, 0))
    error_message = "vpc_connector_cidr deve ser um CIDR IPv4 válido (ex: 10.8.0.0/28)."
  }
}
