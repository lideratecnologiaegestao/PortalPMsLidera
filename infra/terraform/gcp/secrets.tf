# ============================================================
# secrets.tf — Secret Manager
# Portal de Prefeitura (SaaS multi-tenant)
#
# Este arquivo cria os RECURSOS de segredo no Secret Manager,
# mas NÃO popula os valores. Os valores devem ser adicionados
# após o terraform apply usando gcloud CLI:
#
#   echo -n 'valor-secreto' | gcloud secrets versions add NOME_DO_SEGREDO \
#     --project=PROJECT_ID \
#     --data-file=-
#
# NUNCA inclua valores de segredos em arquivos .tf, .tfvars,
# variáveis de ambiente do CI/CD ou logs.
#
# Referenciados no cloudrun.tf via:
#   value_source { secret_key_ref { secret = "NOME", version = "latest" } }
# ============================================================

locals {
  # Labels comuns a todos os segredos
  secret_labels = {
    environment = var.environment
    managed_by  = "terraform"
    project     = "portal-prefeitura"
  }
}

# ------------------------------------------------------------------
# Segredos de autenticação e criptografia
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "auth_jwt_secret" {
  secret_id = "AUTH_JWT_SECRET"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}  # Replicação automática gerenciada pelo Google
  }

  # Para popular: openssl rand -base64 48 | gcloud secrets versions add AUTH_JWT_SECRET --data-file=-
  # Requisito: mínimo 32 caracteres. Nunca alterar em produção sem rotação planejada.
  # Rotação inválida invalida TODOS os JWTs ativos (todos os usuários são deslogados).
}

resource "google_secret_manager_secret" "cpf_pepper" {
  secret_id = "CPF_PEPPER"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular: openssl rand -base64 32 | gcloud secrets versions add CPF_PEPPER --data-file=-
  # CRÍTICO LGPD: este valor é usado para hash irreversível de CPF.
  # UMA VEZ definido em produção, NUNCA alterar — tornaria todos os CPFs existentes
  # incomparáveis com novos hashes e quebraria a autenticação por CPF.
}

# ------------------------------------------------------------------
# Segredos de banco de dados
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular (substitua IP e SENHA):
  # echo -n "postgresql://portal_app:SENHA@IP_PRIVADO:5432/portal?schema=public&connection_limit=20&pool_timeout=10" \
  #   | gcloud secrets versions add DATABASE_URL --data-file=-
  #
  # Parâmetros Prisma recomendados:
  #   connection_limit: 20 (nunca exceder max_connections/num_instâncias)
  #   pool_timeout: 10 (segundos para aguardar conexão disponível)
  #   connect_timeout: 10
}

resource "google_secret_manager_secret" "database_url_readonly" {
  secret_id = "DATABASE_URL_READONLY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular:
  # echo -n "postgresql://portal_ro:SENHA@IP_PRIVADO:5432/portal?schema=public&connection_limit=5" \
  #   | gcloud secrets versions add DATABASE_URL_READONLY --data-file=-
}

# ------------------------------------------------------------------
# Segredos do Redis
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "redis_password" {
  secret_id = "REDIS_PASSWORD"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular (se AUTH estiver habilitado no Memorystore):
  # gcloud redis instances get-auth-string portal-redis --region=us-east1 \
  #   | gcloud secrets versions add REDIS_PASSWORD --data-file=-
  # Se AUTH não estiver habilitado, popule com string vazia ou não use.
}

# ------------------------------------------------------------------
# Segredos de Storage (GCS HMAC keys)
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "storage_access_key" {
  secret_id = "STORAGE_ACCESS_KEY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular com o Access ID do HMAC key criado pelo storage.tf:
  # terraform output -raw hmac_access_id | gcloud secrets versions add STORAGE_ACCESS_KEY --data-file=-
  # Valor exemplo: GOOG1EABC123... (começa com GOOG1E)
}

resource "google_secret_manager_secret" "storage_secret_key" {
  secret_id = "STORAGE_SECRET_KEY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # ATENÇÃO: o HMAC secret é exibido APENAS no momento da criação pelo Terraform.
  # Execute imediatamente após terraform apply:
  # terraform output -raw hmac_secret | gcloud secrets versions add STORAGE_SECRET_KEY --data-file=-
  # Se perdido, revogue a HMAC key e crie uma nova.
}

# ------------------------------------------------------------------
# Segredos de APIs externas — Inteligência Artificial
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "ANTHROPIC_API_KEY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular: echo -n "sk-ant-api03-..." | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-
  # Usado pelos módulos: triagem de manifestações, RAG, chatbot, OCR de documentos.
  # Crie uma API key dedicada por ambiente (dev/staging/prod) no console Anthropic.
}

resource "google_secret_manager_secret" "voyage_api_key" {
  secret_id = "VOYAGE_API_KEY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Opcional — provider de embeddings Voyage AI para busca semântica pgvector.
  # Se não usar Voyage, configure EMBEDDINGS_PROVIDER=openai e use OPENAI_API_KEY.
  # Para popular: echo -n "pa-..." | gcloud secrets versions add VOYAGE_API_KEY --data-file=-
}

# ------------------------------------------------------------------
# Segredo gov.br OIDC (Login Único do Cidadão)
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "govbr_client_secret" {
  secret_id = "GOVBR_CLIENT_SECRET"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular: echo -n "segredo-oauth2-govbr" | gcloud secrets versions add GOVBR_CLIENT_SECRET --data-file=-
  # Obtido no portal do Login Único: https://acesso.gov.br/api-login
  # O client_id correspondente vai em variável de ambiente não-secreta: GOVBR_CLIENT_ID
}

# ------------------------------------------------------------------
# Segredo SMTP (notificações por e-mail)
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "smtp_password" {
  secret_id = "SMTP_PASSWORD"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Para popular: echo -n "senha-smtp" | gcloud secrets versions add SMTP_PASSWORD --data-file=-
  # Usado pelo módulo de notificações (SLA, manifestações, incidentes LGPD).
  # Recomendamos SendGrid ou AWS SES em produção para alta entregabilidade.
}

# ------------------------------------------------------------------
# Segredos do Diário Oficial e ICP-Brasil
# ------------------------------------------------------------------

resource "google_secret_manager_secret" "diario_signing_key" {
  secret_id = "DIARIO_SIGNING_KEY"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Chave para assinatura digital das edições do Diário Oficial.
  # Gate de produção: publicar exige certificado ICP-Brasil válido.
  # Para popular: echo -n "chave-privada-pem" | gcloud secrets versions add DIARIO_SIGNING_KEY --data-file=-
}

resource "google_secret_manager_secret" "icp_cert_password" {
  secret_id = "ICP_CERT_PASSWORD"
  project   = var.project_id
  labels    = local.secret_labels

  replication {
    auto {}
  }

  # Senha do certificado ICP-Brasil (arquivo .pfx/.p12) para o Diário Oficial.
  # O arquivo do certificado deve ser armazenado no GCS (não no Secret Manager)
  # e seu caminho configurado em ICP_CERT_PATH (variável não-secreta).
  # Para popular: echo -n "senha-pfx" | gcloud secrets versions add ICP_CERT_PASSWORD --data-file=-
}

# ------------------------------------------------------------------
# Permissões: Cloud Run SA pode ler os segredos
# ------------------------------------------------------------------
# O IAM binding é feito no nível do projeto em iam.tf (roles/secretmanager.secretAccessor).
# Para permissões mais granulares (SA específica por segredo), use:
#
# resource "google_secret_manager_secret_iam_member" "exemplo" {
#   secret_id = google_secret_manager_secret.anthropic_api_key.id
#   role      = "roles/secretmanager.secretAccessor"
#   member    = "serviceAccount:${google_service_account.portal_cloudrun_sa.email}"
# }
