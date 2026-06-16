# ============================================================
# storage.tf — Cloud Storage (GCS) como backend S3-compatível
# Portal de Prefeitura (SaaS multi-tenant)
#
# O GCS é usado via interoperabilidade S3 (XML API + HMAC keys).
# O SDK S3 do Node.js (aws-sdk v3 / @aws-sdk/client-s3) conecta
# diretamente no GCS sem modificações no código da aplicação.
#
# Configuração obrigatória na API:
#   STORAGE_ENDPOINT=https://storage.googleapis.com
#   STORAGE_REGION=auto
#   STORAGE_BUCKET=portal
#   STORAGE_ACCESS_KEY=GOOG1E...       (HMAC Key ID)
#   STORAGE_SECRET_KEY=...              (HMAC Secret)
#   STORAGE_FORCE_PATH_STYLE=true       (OBRIGATÓRIO para GCS)
#
# STORAGE_FORCE_PATH_STYLE=true é obrigatório porque o GCS usa
# path-style para interoperabilidade S3:
#   https://storage.googleapis.com/BUCKET/objeto
# (não virtual-hosted: https://BUCKET.storage.googleapis.com/objeto)
# ============================================================

# ------------------------------------------------------------------
# Service Account para operações de storage
# ------------------------------------------------------------------
# Esta SA é usada para gerar as HMAC keys de interoperabilidade S3.
# Separada da SA do Cloud Run para princípio do menor privilégio.
resource "google_service_account" "portal_storage_sa" {
  account_id   = "portal-storage-sa"
  display_name = "Portal Prefeitura — Storage Service Account"
  description  = "Service account para operações de storage do Portal. Usada para gerar HMAC keys de interoperabilidade S3."
  project      = var.project_id
}

# ------------------------------------------------------------------
# Bucket principal — "portal" (ou "{project_id}-portal")
# ------------------------------------------------------------------
resource "google_storage_bucket" "portal" {
  name          = "${var.project_id}-${var.storage_bucket_name}"
  # Nome global único: prefixar com project_id evita colisões.
  # A aplicação usa var.storage_bucket_name (ex: "portal") como nome lógico;
  # configure STORAGE_BUCKET com o nome real (com prefixo project_id).

  location      = var.storage_location  # default: "US" (multi-region)
  project       = var.project_id

  # ------------------------------------------------------------------
  # Segurança: uniform bucket-level access
  # ------------------------------------------------------------------
  uniform_bucket_level_access = true
  # Desabilita ACLs por objeto (legado). Com uniform access, todas as
  # permissões são controladas via IAM no nível do bucket.
  # OBRIGATÓRIO: sem isso, seria possível dar acesso público acidental
  # a arquivos sensíveis (documentos de manifestações, denúncias, etc.).

  public_access_prevention = "enforced"
  # Bloqueia qualquer tentativa de tornar o bucket ou objetos públicos.
  # Arquivos servidos ao cidadão devem passar PELO BACKEND (API NestJS),
  # que valida RLS e permissões antes de fazer proxy do arquivo.
  # NUNCA servir uploads diretamente do GCS sem validação da API.

  # ------------------------------------------------------------------
  # Versionamento de objetos
  # ------------------------------------------------------------------
  versioning {
    enabled = true
    # Mantém versões anteriores de arquivos.
    # Útil para recuperar arquivos sobrescritos acidentalmente.
    # Combine com lifecycle rule para controlar custo de versões antigas.
  }

  # ------------------------------------------------------------------
  # Lifecycle rules — gerenciamento automático de objetos
  # ------------------------------------------------------------------
  lifecycle_rule {
    # Regra 1: Excluir arquivos temporários após 30 dias
    # O prefixo temp/ é usado para uploads em andamento e processamentos
    # temporários. Se não deletados manualmente, o lifecycle os remove.
    condition {
      age    = 30           # dias
      with_state = "ANY"    # aplica a objetos live e versões
      matches_prefix = ["temp/"]
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    # Regra 2: Mover objetos antigos para armazenamento mais barato
    # Arquivos do Diário Oficial e documentos não acessados há 90 dias
    # vão para Nearline (acesso ~1x/mês); após 365 dias, para Coldline.
    condition {
      age            = 90
      matches_prefix = ["diario/", "uploads/"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    # Regra 3: Excluir versões antigas de objetos após 30 dias
    condition {
      age                = 30
      num_newer_versions = 3   # Mantém as 3 versões mais recentes
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  # ------------------------------------------------------------------
  # CORS — necessário se o frontend fizer download direto via browser
  # ------------------------------------------------------------------
  # ATENÇÃO: o frontend NUNCA deve fazer upload direto no GCS.
  # Todo upload passa pelo backend (API NestJS) — regra do gateway único.
  # O CORS abaixo é apenas para downloads públicos (ex: assets CSS/JS)
  # se decidir servir alguns assets estáticos diretamente do GCS.
  cors {
    origin          = ["https://*.${var.domain}", "https://${var.domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }

  force_destroy = false # Proteção: impede exclusão acidental do bucket com conteúdo
}

# ------------------------------------------------------------------
# HMAC Key para interoperabilidade S3
# ------------------------------------------------------------------
# As HMAC keys permitem usar o bucket GCS com qualquer cliente S3-compatível.
# O SDK AWS v3 (@aws-sdk/client-s3) na API NestJS usa essas chaves.
#
# A secret gerada aqui deve ser armazenada no Secret Manager:
#   STORAGE_ACCESS_KEY = hmac_key.access_id
#   STORAGE_SECRET_KEY = hmac_key.secret  (disponível SOMENTE no momento da criação!)
#
# ATENÇÃO: o campo "secret" do HMAC key é exibido apenas UMA VEZ no
# momento da criação e não pode ser recuperado depois. Salve imediatamente
# no Secret Manager após o terraform apply.
resource "google_storage_hmac_key" "portal_storage_hmac" {
  service_account_email = google_service_account.portal_storage_sa.email
  project               = var.project_id
  state                 = "ACTIVE"
}

# ------------------------------------------------------------------
# IAM — permissões no bucket
# ------------------------------------------------------------------
# A SA do Cloud Run tem acesso de administrador de objetos no bucket.
# Isso permite upload, download, delete e list de objetos.
resource "google_storage_bucket_iam_member" "cloudrun_sa_storage_admin" {
  bucket = google_storage_bucket.portal.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"

  depends_on = [google_service_account.portal_cloudrun_sa]
}

# A SA de storage (para HMAC) tem acesso completo ao bucket
resource "google_storage_bucket_iam_member" "storage_sa_bucket_admin" {
  bucket = google_storage_bucket.portal.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.portal_storage_sa.email}"
}

# ------------------------------------------------------------------
# Outputs locais
# ------------------------------------------------------------------
# O nome real do bucket (com prefixo project_id) é exportado em outputs.tf.
# Configure STORAGE_BUCKET na aplicação com o nome real do bucket.
