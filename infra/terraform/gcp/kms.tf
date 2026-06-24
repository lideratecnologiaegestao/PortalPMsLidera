# ============================================================
# kms.tf — Cloud KMS Key Ring e Customer-Managed Encryption Keys (CMEK)
# Portal de Prefeitura (SaaS multi-tenant)
#
# CMEK é obrigatório para conformidade de segurança (Checkov CKV_GCP_*).
# Todas as chaves têm rotação automática a cada 90 dias.
#
# Recursos que usam CMEK:
#   - Cloud SQL (database.tf)          → google_kms_crypto_key.cloudsql
#   - Cloud Storage (storage.tf)       → google_kms_crypto_key.storage
#   - Artifact Registry (artifact_registry.tf) → google_kms_crypto_key.artifact_registry
#   - Secret Manager (secrets.tf)      → google_kms_crypto_key.secret_manager
# ============================================================

resource "google_kms_key_ring" "portal" {
  name     = "portal-keyring"
  location = var.region
  project  = var.project_id
}

# ------------------------------------------------------------------
# Chave para Cloud SQL (PostgreSQL)
# ------------------------------------------------------------------
resource "google_kms_crypto_key" "cloudsql" {
  name            = "portal-cloudsql-key"
  key_ring        = google_kms_key_ring.portal.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 dias

  lifecycle {
    prevent_destroy = true
  }
}

# ------------------------------------------------------------------
# Chave para Cloud Storage (GCS)
# ------------------------------------------------------------------
resource "google_kms_crypto_key" "storage" {
  name            = "portal-storage-key"
  key_ring        = google_kms_key_ring.portal.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 dias

  lifecycle {
    prevent_destroy = true
  }
}

# ------------------------------------------------------------------
# Chave para Artifact Registry
# ------------------------------------------------------------------
resource "google_kms_crypto_key" "artifact_registry" {
  name            = "portal-artifact-key"
  key_ring        = google_kms_key_ring.portal.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 dias

  lifecycle {
    prevent_destroy = true
  }
}

# ------------------------------------------------------------------
# Chave para Secret Manager
# ------------------------------------------------------------------
resource "google_kms_crypto_key" "secret_manager" {
  name            = "portal-secretmgr-key"
  key_ring        = google_kms_key_ring.portal.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 dias

  lifecycle {
    prevent_destroy = true
  }
}
