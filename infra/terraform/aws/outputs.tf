# outputs.tf — Valores exportados após terraform apply do Portal de Prefeitura
#
# Use os outputs para configurar DNS, Secrets Manager e CI/CD:
#   terraform output alb_dns_name
#   terraform output -json > outputs.json

# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------

output "vpc_id" {
  description = "ID da VPC criada para o Portal de Prefeitura"
  value       = aws_vpc.portal.id
}

output "private_subnet_ids" {
  description = "Lista de IDs das subnets privadas (ECS, RDS, ElastiCache)"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Lista de IDs das subnets públicas (ALB, NAT Gateway)"
  value       = aws_subnet.public[*].id
}

# ---------------------------------------------------------------------------
# Load Balancer
# ---------------------------------------------------------------------------

output "alb_dns_name" {
  description = "DNS público do Application Load Balancer. Crie um CNAME record no seu DNS apontando para este valor (ex: CNAME *.suaprefeitura.gov.br → este endpoint)"
  value       = aws_lb.portal.dns_name
}

output "alb_zone_id" {
  description = "Zone ID do ALB (usado para criar Alias records no Route 53)"
  value       = aws_lb.portal.zone_id
}

output "alb_arn" {
  description = "ARN do ALB (usado para associar WAF ou outros recursos)"
  value       = aws_lb.portal.arn
}

# ---------------------------------------------------------------------------
# Banco de Dados
# ---------------------------------------------------------------------------

output "rds_endpoint" {
  description = "Endpoint de conexão do RDS PostgreSQL (hostname:porta). Use para montar a DATABASE_URL no Secrets Manager."
  value       = aws_db_instance.portal.endpoint
  sensitive   = true # oculto por padrão — use: terraform output -raw rds_endpoint
}

output "rds_identifier" {
  description = "Identificador da instância RDS (usado para operações via AWS CLI)"
  value       = aws_db_instance.portal.identifier
}

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

output "redis_primary_endpoint" {
  description = "Endpoint primário do ElastiCache Redis. Use para configurar REDIS_HOST na task ECS."
  value       = aws_elasticache_replication_group.portal.primary_endpoint_address
}

output "redis_port" {
  description = "Porta do Redis ElastiCache"
  value       = aws_elasticache_replication_group.portal.port
}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

output "s3_bucket_name" {
  description = "Nome do bucket S3 para armazenamento de arquivos do portal"
  value       = aws_s3_bucket.portal.id
}

output "s3_bucket_arn" {
  description = "ARN do bucket S3 (usado para configurar políticas IAM adicionais)"
  value       = aws_s3_bucket.portal.arn
}

# ---------------------------------------------------------------------------
# Container Registry
# ---------------------------------------------------------------------------

output "ecr_api_url" {
  description = "URL do repositório ECR da API NestJS. Use para docker push e configurar var.image_api."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_web_url" {
  description = "URL do repositório ECR do Web Next.js. Use para docker push e configurar var.image_web."
  value       = aws_ecr_repository.web.repository_url
}

# ---------------------------------------------------------------------------
# ECS
# ---------------------------------------------------------------------------

output "ecs_cluster_name" {
  description = "Nome do cluster ECS (usado em comandos ecs CLI e para deployment)"
  value       = aws_ecs_cluster.portal.name
}

output "ecs_cluster_arn" {
  description = "ARN do cluster ECS"
  value       = aws_ecs_cluster.portal.arn
}

output "ecs_service_api_name" {
  description = "Nome do serviço ECS da API (usado para forçar novo deployment via CLI)"
  value       = aws_ecs_service.api.name
}

output "ecs_service_web_name" {
  description = "Nome do serviço ECS do Web (usado para forçar novo deployment via CLI)"
  value       = aws_ecs_service.web.name
}

# ---------------------------------------------------------------------------
# Dica pós-apply: comandos úteis
# ---------------------------------------------------------------------------
# Forçar novo deployment da API (após push de nova imagem):
#   aws ecs update-service \
#     --cluster $(terraform output -raw ecs_cluster_name) \
#     --service $(terraform output -raw ecs_service_api_name) \
#     --force-new-deployment
#
# Configurar DNS (Cloudflare ou Route 53):
#   CNAME *.suaprefeitura.gov.br → $(terraform output -raw alb_dns_name)
#   CNAME api.suaprefeitura.gov.br → $(terraform output -raw alb_dns_name)
