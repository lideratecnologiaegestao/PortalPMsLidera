# ============================================================
# outputs.tf — Outputs do módulo Terraform GCP
# Portal de Prefeitura (SaaS multi-tenant)
#
# Use estes valores para:
#   - Configurar o DNS (load_balancer_ip)
#   - Popular segredos no Secret Manager (cloud_sql_private_ip, redis_host)
#   - Configurar o Cloud SQL Auth Proxy (cloud_sql_connection_name)
#   - Verificar URLs dos serviços (api_url, web_url)
#
# Após terraform apply:
#   terraform output -json > terraform-outputs.json
# ============================================================

# ------------------------------------------------------------------
# Cloud Run — URLs dos serviços
# ------------------------------------------------------------------

output "api_url" {
  description = "URL interna do serviço Cloud Run portal-api. Use como API_URL interno (server-side). NÃO é acessível pela internet — use o domínio via Load Balancer para acesso externo."
  value       = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  description = "URL interna do serviço Cloud Run portal-web. Acessível externamente via Load Balancer no domínio configurado."
  value       = google_cloud_run_v2_service.web.uri
}

# ------------------------------------------------------------------
# Load Balancer
# ------------------------------------------------------------------

output "load_balancer_ip" {
  description = "Endereço IP global do Cloud Load Balancer. Configure este IP nos registros DNS: A prefeitura.app.br → IP e A *.prefeitura.app.br → IP."
  value       = google_compute_global_address.portal_lb_ip.address
}

# ------------------------------------------------------------------
# Cloud SQL (PostgreSQL)
# ------------------------------------------------------------------

output "cloud_sql_connection_name" {
  description = "Nome de conexão da instância Cloud SQL no formato PROJECT:REGION:INSTANCE. Use com o Cloud SQL Auth Proxy para rodar migrations e seeds: ./cloud-sql-proxy CONNECTION_NAME --port=5433"
  value       = google_sql_database_instance.portal_postgres.connection_name
}

output "cloud_sql_private_ip" {
  description = "Endereço IP privado do Cloud SQL na VPC. Use para compor a DATABASE_URL no Secret Manager (postgresql, usuario portal_app, este IP, porta 5432, db portal)."
  value       = google_sql_database_instance.portal_postgres.private_ip_address
  sensitive   = true  # Marcado sensitive para não expor infraestrutura interna em logs de CI/CD
}

output "cloud_sql_instance_name" {
  description = "Nome da instância Cloud SQL (sem project/region). Use para backups manuais: gcloud sql backups create --instance=NOME"
  value       = google_sql_database_instance.portal_postgres.name
}

# ------------------------------------------------------------------
# Memorystore (Redis)
# ------------------------------------------------------------------

output "redis_host" {
  description = "Endereço IP privado do Memorystore Redis. Popule no Secret Manager como REDIS_HOST: terraform output -raw redis_host | gcloud secrets versions add REDIS_HOST --data-file=-"
  value       = google_redis_instance.portal_redis.host
  sensitive   = true  # Marcado sensitive para não expor infraestrutura interna em logs de CI/CD
}

output "redis_port" {
  description = "Porta do Memorystore Redis (padrão: 6379)."
  value       = google_redis_instance.portal_redis.port
}

output "redis_current_location_id" {
  description = "Zona onde o Redis primário está rodando. Útil para verificar HA e failover."
  value       = google_redis_instance.portal_redis.current_location_id
}

# ------------------------------------------------------------------
# Cloud Storage
# ------------------------------------------------------------------

output "storage_bucket_name" {
  description = "Nome real do bucket GCS (inclui prefixo project_id). Configure STORAGE_BUCKET na aplicação com este valor."
  value       = google_storage_bucket.portal.name
}

output "storage_bucket_url" {
  description = "URL do bucket no formato gs://. Use com gsutil para operações administrativas."
  value       = google_storage_bucket.portal.url
}

output "hmac_access_id" {
  description = "HMAC Key Access ID para interoperabilidade S3 com GCS. Popule no Secret Manager como STORAGE_ACCESS_KEY."
  value       = google_storage_hmac_key.portal_storage_hmac.access_id
  sensitive   = true  # Marcado sensitive — access ID do HMAC não deve ser exposto em logs
}

output "hmac_secret" {
  description = "HMAC Key Secret para interoperabilidade S3. ATENÇÃO: disponível apenas agora! Popule IMEDIATAMENTE no Secret Manager como STORAGE_SECRET_KEY. Após isso, não é mais recuperável."
  value       = google_storage_hmac_key.portal_storage_hmac.secret
  sensitive   = true   # SENSÍVEL — aparece ofuscado no terminal; visível em terraform.tfstate
}

# ------------------------------------------------------------------
# Artifact Registry
# ------------------------------------------------------------------

output "artifact_registry_url" {
  description = "URL base do repositório Artifact Registry. Use para build e push das imagens Docker: docker push ARTIFACT_REGISTRY_URL/api:TAG"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.portal.repository_id}"
}

# ------------------------------------------------------------------
# Service Accounts
# ------------------------------------------------------------------

output "cloudrun_sa_email" {
  description = "E-mail da Service Account do Cloud Run. Use para conceder permissões adicionais ou configurar Workload Identity."
  value       = google_service_account.portal_cloudrun_sa.email
}

output "cloudbuild_sa_email" {
  description = "E-mail da Service Account do Cloud Build. Configure no GitHub Actions como GOOGLE_SERVICE_ACCOUNT para Workload Identity Federation."
  value       = google_service_account.portal_cloudbuild_sa.email
}

output "storage_sa_email" {
  description = "E-mail da Service Account de Storage. Associada às HMAC keys para interoperabilidade S3."
  value       = google_service_account.portal_storage_sa.email
}

# ------------------------------------------------------------------
# VPC e rede
# ------------------------------------------------------------------

output "vpc_name" {
  description = "Nome da VPC criada para o Portal."
  value       = google_compute_network.portal_vpc.name
}

output "vpc_connector_name" {
  description = "Nome do Serverless VPC Access Connector. Referenciado nos Cloud Run services para acesso ao banco e Redis."
  value       = google_vpc_access_connector.portal_connector.name
}

# ------------------------------------------------------------------
# Comandos úteis pós-apply (impresso no terminal)
# ------------------------------------------------------------------

output "next_steps" {
  description = "Próximos passos após o terraform apply"
  sensitive   = true  # Contém IPs privados de infraestrutura interna
  value = <<-EOT

    ==================== PRÓXIMOS PASSOS ====================

    1. Configure o DNS (registre o IP do Load Balancer):
       A ${var.domain}   → ${google_compute_global_address.portal_lb_ip.address}
       A *.${var.domain} → ${google_compute_global_address.portal_lb_ip.address}

    2. Salve o HMAC secret no Secret Manager AGORA:
       terraform output -raw hmac_secret | gcloud secrets versions add STORAGE_SECRET_KEY --project=${var.project_id} --data-file=-
       terraform output -raw hmac_access_id | gcloud secrets versions add STORAGE_ACCESS_KEY --project=${var.project_id} --data-file=-

    3. Salve o IP do Redis no Secret Manager:
       terraform output -raw redis_host | gcloud secrets versions add REDIS_HOST --project=${var.project_id} --data-file=-

    4. Popule a DATABASE_URL no Secret Manager. Monte a connection string postgresql
       com: usuario portal_app, host ${google_sql_database_instance.portal_postgres.private_ip_address}, porta 5432, db portal, schema public.
       printf '%s' "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL --project=${var.project_id} --data-file=-

    5. Rode as migrations via Cloud SQL Auth Proxy:
       ./cloud-sql-proxy ${google_sql_database_instance.portal_postgres.connection_name} --port=5433 &
       for f in $(ls ../../../db/*.sql | sort); do psql -h 127.0.0.1 -p 5433 -U postgres -d portal -f "$f"; done

    6. Verifique o certificado TLS (pode levar 15-60 min após DNS propagar):
       gcloud compute ssl-certificates describe portal-cert --format="value(managed.status)"

    7. Smoke test:
       curl https://api.${var.domain}/api/health/ready

    =========================================================
  EOT
}
