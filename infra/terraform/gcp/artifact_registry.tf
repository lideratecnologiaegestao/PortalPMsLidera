# ============================================================
# artifact_registry.tf — Artifact Registry (Docker registry privado)
# Portal de Prefeitura (SaaS multi-tenant)
#
# Armazena as imagens Docker da API NestJS e do portal Next.js.
# Substitui o Container Registry legado (gcr.io).
#
# Comandos para build e push das imagens:
#
#   # 1. Autenticar o Docker no Artifact Registry
#   gcloud auth configure-docker us-east1-docker.pkg.dev
#
#   # 2. Build da API NestJS
#   docker build \
#     --file api/Dockerfile \
#     --tag us-east1-docker.pkg.dev/PROJECT_ID/portal/api:$(git rev-parse --short HEAD) \
#     --tag us-east1-docker.pkg.dev/PROJECT_ID/portal/api:latest \
#     ./api
#
#   # 3. Build do portal Next.js
#   docker build \
#     --file web/Dockerfile \
#     --tag us-east1-docker.pkg.dev/PROJECT_ID/portal/web:$(git rev-parse --short HEAD) \
#     --tag us-east1-docker.pkg.dev/PROJECT_ID/portal/web:latest \
#     ./web
#
#   # 4. Push
#   docker push us-east1-docker.pkg.dev/PROJECT_ID/portal/api --all-tags
#   docker push us-east1-docker.pkg.dev/PROJECT_ID/portal/web --all-tags
#
# Em CI/CD (Cloud Build / GitHub Actions), use Workload Identity Federation
# em vez de service account keys para autenticar o Docker.
# ============================================================

resource "google_artifact_registry_repository" "portal" {
  repository_id = "portal"
  format        = "DOCKER"
  location      = var.region
  project       = var.project_id
  description   = "Repositório Docker privado para as imagens da plataforma Portal de Prefeitura (API NestJS + Web Next.js)"

  # CMEK — Customer-Managed Encryption Key (CKV_GCP_84 for Artifact Registry)
  kms_key_name = google_kms_crypto_key.artifact_registry.id

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  # ------------------------------------------------------------------
  # Limpeza automática de imagens antigas
  # ------------------------------------------------------------------
  # Mantém apenas as 10 versões mais recentes de cada imagem para controlar custos.
  # Imagens mais antigas são excluídas automaticamente.
  cleanup_policies {
    id     = "keep-recent-versions"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10  # Mantém as 10 versões mais recentes de cada imagem
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state   = "UNTAGGED"  # Deleta imagens sem tag (ex: builds intermediários)
      older_than  = "604800s"   # Mais velhas que 7 dias (604800 segundos)
    }
  }
}

# ------------------------------------------------------------------
# IAM — permissões no Artifact Registry
# ------------------------------------------------------------------

# A SA do Cloud Run pode baixar (pull) imagens do registry
resource "google_artifact_registry_repository_iam_member" "cloudrun_sa_reader" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.portal.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
}

# A SA do Cloud Build pode publicar (push) imagens no registry
resource "google_artifact_registry_repository_iam_member" "cloudbuild_sa_writer" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.portal.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.portal_cloudbuild_sa.email}"
}
