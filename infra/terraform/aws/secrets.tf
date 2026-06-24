# secrets.tf — Secrets Manager para os segredos do Portal de Prefeitura
#
# IMPORTANTE: Este arquivo cria APENAS os recursos do Secrets Manager (sem valores reais).
# Após o terraform apply, popule cada segredo com o valor real usando:
#
#   aws secretsmanager put-secret-value \
#     --secret-id portal/auth-jwt-secret \
#     --secret-string 'VALOR_REAL'
#
# Ou usando o console AWS → Secrets Manager → selecione o segredo → "Retrieve secret value"
#
# NUNCA versione terraform.tfvars com senhas reais.
# NUNCA passe secrets via variáveis de ambiente do Terraform em pipelines públicos.

locals {
  # Prefixo dos segredos no Secrets Manager (isolamento por projeto)
  secret_prefix = "portal"
}

# ---------------------------------------------------------------------------
# Segredo: JWT Secret — assina tokens de autenticação da API
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "auth_jwt_secret" {
  name                    = "${local.secret_prefix}/auth-jwt-secret"
  description             = "Chave secreta para assinar tokens JWT da API NestJS (AUTH_JWT_SECRET)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "autenticacao"
  }
}

resource "aws_secretsmanager_secret_version" "auth_jwt_secret" {
  secret_id     = aws_secretsmanager_secret.auth_jwt_secret.id
  secret_string = "POPULATE_ME" # substitua com: openssl rand -base64 64
}

# ---------------------------------------------------------------------------
# Segredo: CPF Pepper — tempero criptográfico para hash de CPF (LGPD)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "cpf_pepper" {
  name                    = "${local.secret_prefix}/cpf-pepper"
  description             = "Pepper para derivação criptográfica do CPF (CPF_PEPPER) — proteção LGPD"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "lgpd"
  }
}

resource "aws_secretsmanager_secret_version" "cpf_pepper" {
  secret_id     = aws_secretsmanager_secret.cpf_pepper.id
  secret_string = "POPULATE_ME" # substitua com: openssl rand -base64 32
}

# ---------------------------------------------------------------------------
# Segredo: DATABASE_URL — connection string completa da aplicação (portal_app)
# Formato: connection string PostgreSQL (usuario portal_app, host do RDS, db portal, sslmode=require)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.secret_prefix}/database-url"
  description             = "Connection string PostgreSQL para a aplicação (DATABASE_URL) — role portal_app com RLS ativo"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "banco-de-dados"
  }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "POPULATE_ME" # connection string do portal_app (host RDS, db portal, sslmode=require)
}

# ---------------------------------------------------------------------------
# Segredo: DATABASE_URL_READONLY — connection string somente leitura (portal_ro)
# Usada para queries de relatórios e transparência sem afetar performance da API
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url_readonly" {
  name                    = "${local.secret_prefix}/database-url-readonly"
  description             = "Connection string PostgreSQL somente leitura (DATABASE_URL_READONLY) — role portal_ro"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "banco-de-dados"
  }
}

resource "aws_secretsmanager_secret_version" "database_url_readonly" {
  secret_id     = aws_secretsmanager_secret.database_url_readonly.id
  secret_string = "POPULATE_ME" # connection string do portal_ro (somente leitura, host RDS, db portal)
}

# ---------------------------------------------------------------------------
# Segredo: Redis Password — token de autenticação do ElastiCache
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "redis_password" {
  name                    = "${local.secret_prefix}/redis-password"
  description             = "Token de autenticação do Redis ElastiCache (REDIS_PASSWORD) — mesmo valor de var.redis_auth_token"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "cache"
  }
}

resource "aws_secretsmanager_secret_version" "redis_password" {
  secret_id     = aws_secretsmanager_secret.redis_password.id
  secret_string = "POPULATE_ME" # mesmo valor de var.redis_auth_token
}

# ---------------------------------------------------------------------------
# Segredo: Storage Access Key — credencial S3 do IAM user portal_s3_user
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "storage_access_key" {
  name                    = "${local.secret_prefix}/storage-access-key"
  description             = "AWS Access Key ID do IAM user portal-s3-app para acesso ao S3 (STORAGE_ACCESS_KEY)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "storage"
  }
}

resource "aws_secretsmanager_secret_version" "storage_access_key" {
  secret_id     = aws_secretsmanager_secret.storage_access_key.id
  secret_string = "POPULATE_ME" # gere via: aws iam create-access-key --user-name portal-s3-app
}

# ---------------------------------------------------------------------------
# Segredo: Storage Secret Key — credencial S3 do IAM user portal_s3_user
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "storage_secret_key" {
  name                    = "${local.secret_prefix}/storage-secret-key"
  description             = "AWS Secret Access Key do IAM user portal-s3-app para acesso ao S3 (STORAGE_SECRET_KEY)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "storage"
  }
}

resource "aws_secretsmanager_secret_version" "storage_secret_key" {
  secret_id     = aws_secretsmanager_secret.storage_secret_key.id
  secret_string = "POPULATE_ME" # gerado junto com STORAGE_ACCESS_KEY
}

# ---------------------------------------------------------------------------
# Segredo: Anthropic API Key — IA (triagem, RAG, chatbot, OCR)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name                    = "${local.secret_prefix}/anthropic-api-key"
  description             = "Chave da API Anthropic para IA (ANTHROPIC_API_KEY) — triagem, RAG, chatbot, OCR"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "ia"
  }
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = "POPULATE_ME" # sk-ant-...
}

# ---------------------------------------------------------------------------
# Segredo: gov.br Client ID — OAuth2/OIDC Login Único (público, mas versionado)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "govbr_client_id" {
  name                    = "${local.secret_prefix}/govbr-client-id"
  description             = "Client ID da aplicação no gov.br Login Único (GOVBR_CLIENT_ID) — OAuth2/OIDC"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "autenticacao-govbr"
  }
}

resource "aws_secretsmanager_secret_version" "govbr_client_id" {
  secret_id     = aws_secretsmanager_secret.govbr_client_id.id
  secret_string = "POPULATE_ME" # obtido no portal de serviços do gov.br
}

# ---------------------------------------------------------------------------
# Segredo: gov.br Client Secret — OAuth2/OIDC Login Único
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "govbr_client_secret" {
  name                    = "${local.secret_prefix}/govbr-client-secret"
  description             = "Client Secret da aplicação no gov.br Login Único (GOVBR_CLIENT_SECRET) — OAuth2/OIDC"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "autenticacao-govbr"
  }
}

resource "aws_secretsmanager_secret_version" "govbr_client_secret" {
  secret_id     = aws_secretsmanager_secret.govbr_client_secret.id
  secret_string = "POPULATE_ME" # obtido no portal de serviços do gov.br
}

# ---------------------------------------------------------------------------
# Segredo: SMTP Password — envio de e-mails (notificações, SLA, ESIC/Ouvidoria)
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "smtp_pass" {
  name                    = "${local.secret_prefix}/smtp-pass"
  description             = "Senha do servidor SMTP para envio de e-mails (SMTP_PASS)"
  recovery_window_in_days = 7
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "notificacoes"
  }
}

resource "aws_secretsmanager_secret_version" "smtp_pass" {
  secret_id     = aws_secretsmanager_secret.smtp_pass.id
  secret_string = "POPULATE_ME"
}

# ---------------------------------------------------------------------------
# Segredo: Diário Signing Key — chave ICP para assinatura digital do Diário Oficial
# AVISO: Esta chave é um gate de produção — publicar no Diário exige certificado ICP-Brasil válido
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "diario_signing_key" {
  name                    = "${local.secret_prefix}/diario-signing-key"
  description             = "Chave privada ICP-Brasil para assinatura digital do Diário Oficial (DIARIO_SIGNING_KEY)"
  recovery_window_in_days = 30
  kms_key_id              = aws_kms_key.portal.arn
  #checkov:skip=CKV2_AWS_57:chaves de terceiros/pepper/cert ICP/connection strings não suportam rotação automática por Lambda do Secrets Manager; rotação é manual conforme política

  tags = {
    Modulo = "diario-oficial"
  }
}

resource "aws_secretsmanager_secret_version" "diario_signing_key" {
  secret_id     = aws_secretsmanager_secret.diario_signing_key.id
  secret_string = "POPULATE_ME" # chave PEM do certificado ICP-Brasil (A3 ou A1)
}
