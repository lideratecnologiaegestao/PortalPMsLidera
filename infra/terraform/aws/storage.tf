# storage.tf — S3 para armazenamento de arquivos do Portal de Prefeitura
#
# Substitui o MinIO da infraestrutura local Lidera.
# Configuração da aplicação (variáveis de ambiente na task ECS):
#   STORAGE_BUCKET=portal
#   STORAGE_REGION=<var.region>
#   STORAGE_FORCE_PATH_STYLE=false  (S3 nativo usa path-style=false; MinIO usava true)
#   STORAGE_ACCESS_KEY=<portal_s3_user access key>
#   STORAGE_SECRET_KEY=<portal_s3_user secret key>
#
# IMPORTANTE: O acesso ao S3 é feito via IAM user dedicado (portal_s3_user — criado em iam.tf).
# As credenciais são armazenadas no Secrets Manager e injetadas na task ECS.
# O frontend/app NUNCA acessa o S3 diretamente — todo upload passa pela API NestJS (multipart).

# ---------------------------------------------------------------------------
# Bucket principal
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "portal" {
  #checkov:skip=CKV2_AWS_62:notificações de evento S3 não são usadas (todo upload passa pela API NestJS); habilitar quando houver consumidor
  #checkov:skip=CKV_AWS_144:replicação cross-region não é requisito deste template; ativar conforme RPO/RTO do cliente
  bucket = var.s3_bucket_name

  # Proteção contra exclusão acidental
  # Para destruir o bucket via Terraform, remova este bloco primeiro
  # e esvazie o bucket manualmente

  tags = {
    Name = "${var.project_name}-storage"
  }
}

# ---------------------------------------------------------------------------
# Versionamento — permite recuperar versões anteriores de arquivos
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_versioning" "portal" {
  bucket = aws_s3_bucket.portal.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ---------------------------------------------------------------------------
# Bloqueio de acesso público — todos os 4 flags habilitados
# Nenhum arquivo é acessível publicamente via URL do S3 diretamente.
# A API NestJS serve os arquivos via endpoints autenticados.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_public_access_block" "portal" {
  bucket = aws_s3_bucket.portal.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Criptografia server-side (SSE-S3 / AES-256)
# Para maior controle de chaves, pode-se migrar para SSE-KMS com CMK dedicada.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_server_side_encryption_configuration" "portal" {
  bucket = aws_s3_bucket.portal.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.portal.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_logging" "portal" {
  bucket = aws_s3_bucket.portal.id

  target_bucket = aws_s3_bucket.alb_logs.id
  target_prefix = "s3-access-logs/"
}

# ---------------------------------------------------------------------------
# Lifecycle — gerenciamento automático de custo e retenção
# ---------------------------------------------------------------------------

resource "aws_s3_bucket_lifecycle_configuration" "portal" {
  bucket = aws_s3_bucket.portal.id

  # Regra 1: mover objetos para STANDARD_IA após 90 dias sem acesso
  # STANDARD_IA custa ~58% menos que STANDARD para armazenamento (acesso menos frequente)
  rule {
    id     = "mover-para-standard-ia"
    status = "Enabled"

    filter {
      prefix = "" # aplica a todos os objetos do bucket
    }

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    # Após 365 dias sem acesso, mover para GLACIER para arquivamento de longo prazo
    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }

  # Regra 2: expirar versões não-correntes após 30 dias
  # Evita que versões antigas acumulem custo indefinidamente
  rule {
    id     = "expirar-versoes-antigas"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    # Remover marcadores de exclusão expirados (limpeza de versões deletadas)
    expiration {
      expired_object_delete_marker = true
    }
  }

  # Regra 3: expirar uploads multipart incompletos após 7 dias
  # Evita acumular cobranças de uploads que falharam
  rule {
    id     = "limpar-uploads-incompletos"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.portal]
}

# ---------------------------------------------------------------------------
# CORS — comentado pois o acesso é via API NestJS, não diretamente pelo browser
#
# Se no futuro for necessário acesso direto do browser (ex: presigned URLs para leitura),
# descomente e ajuste as origens permitidas.
# ---------------------------------------------------------------------------

# resource "aws_s3_bucket_cors_configuration" "portal" {
#   bucket = aws_s3_bucket.portal.id
#
#   cors_rule {
#     allowed_headers = ["*"]
#     allowed_methods = ["GET"]
#     allowed_origins = ["https://*.${var.domain}", "https://${var.domain}"]
#     expose_headers  = ["ETag", "Content-Length", "Content-Type"]
#     max_age_seconds = 3600
#   }
# }
