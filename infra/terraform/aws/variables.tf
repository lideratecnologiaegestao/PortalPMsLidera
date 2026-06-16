# variables.tf — variáveis de entrada do módulo AWS do Portal de Prefeitura

# ---------------------------------------------------------------------------
# Configurações gerais
# ---------------------------------------------------------------------------

variable "region" {
  description = "Região AWS onde todos os recursos serão criados"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Nome do projeto, usado como prefixo nos recursos para evitar colisões"
  type        = string
  default     = "portal-prefeitura"
}

variable "environment" {
  description = "Ambiente de implantação (production, staging, development)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "O ambiente deve ser production, staging ou development."
  }
}

# ---------------------------------------------------------------------------
# Rede (VPC, subnets, AZs)
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "Bloco CIDR principal da VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Lista de Zonas de Disponibilidade usadas para subnets públicas e privadas"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "CIDRs das subnets públicas (ALB, NAT Gateway). Um por AZ."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs das subnets privadas (ECS, RDS, ElastiCache). Um por AZ."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

# ---------------------------------------------------------------------------
# Banco de dados (RDS PostgreSQL 16 + PostGIS)
# ---------------------------------------------------------------------------

variable "db_instance_class" {
  description = "Tipo de instância RDS. db.t3.medium cobre até ~50 tenants; escalar para db.t3.large em produção com carga alta."
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "Nome do banco de dados PostgreSQL criado automaticamente no RDS"
  type        = string
  default     = "portal"
}

variable "db_username" {
  description = "Usuário master do RDS (NOSUPERUSER no PostgreSQL). NÃO é o usuário da aplicação (portal_app)."
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Senha do usuário master do RDS. Use uma senha forte com no mínimo 16 caracteres."
  type        = string
  sensitive   = true
}

variable "db_multi_az" {
  description = "Habilitar Multi-AZ no RDS para alta disponibilidade (recomendado em produção, dobra o custo)"
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Número de dias para manter backups automáticos do RDS (mínimo 7 para produção)"
  type        = number
  default     = 7

  validation {
    condition     = var.db_backup_retention_days >= 1 && var.db_backup_retention_days <= 35
    error_message = "O período de retenção de backups deve estar entre 1 e 35 dias."
  }
}

# ---------------------------------------------------------------------------
# Cache (ElastiCache Redis 7 — BullMQ + cache de sessão)
# ---------------------------------------------------------------------------

variable "redis_node_type" {
  description = "Tipo de nó do ElastiCache. cache.t3.micro cobre desenvolvimento/staging; usar cache.t3.small ou superior em produção."
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_auth_token" {
  description = "Token de autenticação do Redis (AUTH). Mínimo 16 caracteres, sem espaços. Obrigatório quando transit_encryption_enabled=true."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Domínio e certificado TLS
# ---------------------------------------------------------------------------

variable "domain" {
  description = "Domínio principal do portal (ex: suaprefeitura.gov.br). Usado para rotas do ALB e configuração de CORS."
  type        = string
  # Sem default — cada ambiente/cliente tem seu próprio domínio
}

variable "acm_certificate_arn" {
  description = "ARN do certificado ACM para HTTPS no ALB. O certificado deve cobrir *.dominio e dominio (wildcard + apex). Crie antecipadamente no ACM."
  type        = string
  # Sem default — depende do domínio e conta AWS
}

# ---------------------------------------------------------------------------
# Imagens de contêiner (ECR)
# ---------------------------------------------------------------------------

variable "image_api" {
  description = "URL completa da imagem Docker da API NestJS no ECR (ex: 123456789.dkr.ecr.us-east-1.amazonaws.com/portal-prefeitura/api:latest)"
  type        = string
  default     = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/portal-prefeitura/api:latest"
}

variable "image_web" {
  description = "URL completa da imagem Docker do Web Next.js no ECR (ex: 123456789.dkr.ecr.us-east-1.amazonaws.com/portal-prefeitura/web:latest)"
  type        = string
  default     = "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/portal-prefeitura/web:latest"
}

# ---------------------------------------------------------------------------
# Recursos ECS (CPU e memória em unidades Fargate)
# ---------------------------------------------------------------------------

variable "api_cpu" {
  description = "CPU reservada para o contêiner da API em unidades Fargate (1024 = 1 vCPU)"
  type        = number
  default     = 1024
}

variable "api_memory" {
  description = "Memória reservada para o contêiner da API em MiB"
  type        = number
  default     = 2048
}

variable "web_cpu" {
  description = "CPU reservada para o contêiner Web Next.js em unidades Fargate"
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "Memória reservada para o contêiner Web Next.js em MiB"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Número desejado de tarefas ECS da API em execução simultânea"
  type        = number
  default     = 1
}

variable "web_desired_count" {
  description = "Número desejado de tarefas ECS do Web em execução simultânea"
  type        = number
  default     = 1
}

# ---------------------------------------------------------------------------
# Logs e storage
# ---------------------------------------------------------------------------

variable "log_retention_days" {
  description = "Dias de retenção dos logs no CloudWatch Logs"
  type        = number
  default     = 30
}

variable "s3_bucket_name" {
  description = "Nome do bucket S3 para armazenamento de arquivos (substitui MinIO). STORAGE_FORCE_PATH_STYLE=false com S3 nativo."
  type        = string
  default     = "portal"
}

# ---------------------------------------------------------------------------
# Segurança
# ---------------------------------------------------------------------------

variable "enable_waf" {
  description = "Habilitar AWS WAF v2 associado ao ALB para proteção contra ataques comuns (OWASP Top 10)"
  type        = bool
  default     = true
}
