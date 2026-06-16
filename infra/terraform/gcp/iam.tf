# ============================================================
# iam.tf — Service Accounts e permissões IAM
# Portal de Prefeitura (SaaS multi-tenant)
#
# Princípio do menor privilégio:
#   Cada SA tem APENAS as permissões necessárias para sua função.
#   Nenhuma SA tem roles/owner ou roles/editor.
#
# Service Accounts criadas:
#   - portal-cloudrun-sa: executa os containers Cloud Run (API + Web)
#   - portal-cloudbuild-sa: CI/CD (build + deploy)
#   - portal-storage-sa: geração de HMAC keys para GCS (em storage.tf)
# ============================================================

# ------------------------------------------------------------------
# SA 1: portal-cloudrun-sa — runtime dos containers
# ------------------------------------------------------------------
resource "google_service_account" "portal_cloudrun_sa" {
  account_id   = "portal-cloudrun-sa"
  display_name = "Portal Cloud Run — Runtime SA"
  description  = "Service account usada pelos containers portal-api e portal-web em execução. Permissões mínimas: Cloud SQL client, Secret Manager reader, Storage object admin."
  project      = var.project_id
}

# Permissão: conectar ao Cloud SQL
# Necessário para o driver do Prisma estabelecer conexão com a instância.
resource "google_project_iam_member" "cloudrun_sa_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: ler segredos do Secret Manager
# Necessário para injetar DATABASE_URL, AUTH_JWT_SECRET, etc. no Cloud Run.
resource "google_project_iam_member" "cloudrun_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: administrar objetos no bucket de storage
# Necessário para upload/download de arquivos via API NestJS.
# Escopo restrito ao bucket "portal" (não ao projeto inteiro).
resource "google_storage_bucket_iam_member" "cloudrun_sa_storage_admin" {
  bucket = google_storage_bucket.portal.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: enviar traces para o Cloud Trace (distributed tracing)
resource "google_project_iam_member" "cloudrun_sa_trace_agent" {
  project = var.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: escrever métricas customizadas no Cloud Monitoring
resource "google_project_iam_member" "cloudrun_sa_monitoring_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: escrever logs no Cloud Logging
resource "google_project_iam_member" "cloudrun_sa_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# Permissão: invocar outros Cloud Run services (ex: web → api server-side)
# Necessário apenas se a comunicação interna usar IAM auth em vez de URL pública.
# Comente se usar URL pública interna com allUsers invoker.
resource "google_project_iam_member" "cloudrun_sa_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# ------------------------------------------------------------------
# SA 2: portal-cloudbuild-sa — CI/CD pipeline
# ------------------------------------------------------------------
resource "google_service_account" "portal_cloudbuild_sa" {
  account_id   = "portal-cloudbuild-sa"
  display_name = "Portal Cloud Build — CI/CD SA"
  description  = "Service account usada pelo Cloud Build para build das imagens e deploy no Cloud Run. Permissões mínimas: Artifact Registry writer, Cloud Run admin, SA user."
  project      = var.project_id
}

# Permissão: fazer push de imagens no Artifact Registry
resource "google_project_iam_member" "cloudbuild_sa_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}

# Permissão: fazer deploy e gerenciar serviços Cloud Run
resource "google_project_iam_member" "cloudbuild_sa_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}

# Permissão: Cloud Build precisa poder "actAs" a SA do Cloud Run
# para associar a SA correta no momento do deploy.
resource "google_service_account_iam_member" "cloudbuild_can_use_cloudrun_sa" {
  service_account_id = google_service_account.portal_cloudrun_sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}

# Permissão: ler segredos do Secret Manager durante o pipeline (ex: para testes de integração)
resource "google_project_iam_member" "cloudbuild_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}

# Permissão: escrever logs do Cloud Build no Cloud Logging
resource "google_project_iam_member" "cloudbuild_sa_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}

# ------------------------------------------------------------------
# Workload Identity Federation (recomendado para GitHub Actions)
# ------------------------------------------------------------------
# Em vez de baixar e armazenar chaves de SA (JSON keys), configure
# Workload Identity Federation para permitir que o GitHub Actions
# se autentique na GCP diretamente via OIDC token.
#
# Vantagens:
#   - Sem chaves de longa duração (elimina risco de vazamento)
#   - Tokens de curta duração (1 hora)
#   - Auditoria clara no Cloud Logging
#
# Configuração (execute manualmente ou adicione ao Terraform):
#
# gcloud iam workload-identity-pools create "github-actions-pool" \
#   --project=PROJECT_ID \
#   --location="global" \
#   --display-name="GitHub Actions Pool"
#
# gcloud iam workload-identity-pools providers create-oidc "github-provider" \
#   --project=PROJECT_ID \
#   --location="global" \
#   --workload-identity-pool="github-actions-pool" \
#   --display-name="GitHub Actions Provider" \
#   --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
#   --issuer-uri="https://token.actions.githubusercontent.com"
#
# gcloud iam service-accounts add-iam-policy-binding \
#   "portal-cloudbuild-sa@PROJECT_ID.iam.gserviceaccount.com" \
#   --project=PROJECT_ID \
#   --role="roles/iam.workloadIdentityUser" \
#   --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/SEU_ORG/portal-prefeitura"

# ------------------------------------------------------------------
# Auditoria: habilitar audit logs para ações sensíveis de IAM
# ------------------------------------------------------------------
resource "google_project_iam_audit_config" "portal_audit" {
  project = var.project_id
  service = "allServices"  # Habilita para todos os serviços do projeto

  audit_log_config {
    log_type = "ADMIN_READ"    # Loga leituras de configuração administrativa
  }
  audit_log_config {
    log_type = "DATA_WRITE"    # Loga escritas de dados (criação/modificação de recursos)
  }
  audit_log_config {
    log_type = "DATA_READ"     # Loga leituras de dados (cuidado com volume de logs)
    # Comente DATA_READ em produção se o volume de logs for muito alto.
    # Habilite apenas para serviços específicos (ex: secretmanager.googleapis.com)
  }
}
