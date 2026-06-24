# ============================================================
# cloudrun.tf — Cloud Run v2 Services (portal-api e portal-web)
# Portal de Prefeitura (SaaS multi-tenant)
#
# Arquitetura de segurança:
#   - ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER
#     Os serviços SÓ aceitam tráfego do Cloud Load Balancer interno.
#     Nenhum acesso direto da internet às URLs *.run.app.
#   - Secrets injetados via Secret Manager (nunca plaintext)
#   - VPC connector para acesso ao banco e Redis privados
# ============================================================

# ------------------------------------------------------------------
# Service Account dedicada ao Cloud Run
# ------------------------------------------------------------------
# Criada em iam.tf; referenciada aqui.
# Este data source garante que o recurso exista antes dos services.
data "google_service_account" "cloudrun_sa" {
  account_id = "portal-cloudrun-sa"
  project    = var.project_id

  depends_on = [google_service_account.portal_cloudrun_sa]
}

# ------------------------------------------------------------------
# Cloud Run v2 Service — portal-api (NestJS 10)
# ------------------------------------------------------------------
resource "google_cloud_run_v2_service" "api" {
  name     = "portal-api"
  location = var.region
  project  = var.project_id

  # Acesso somente via Load Balancer interno — sem URL pública *.run.app
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.portal_cloudrun_sa.email

    # ------------------------------------------------------------------
    # Escala de instâncias
    # ------------------------------------------------------------------
    scaling {
      min_instance_count = var.min_instances_api  # default: 1 (evita cold start)
      max_instance_count = var.max_instances_api  # default: 10
    }

    # ------------------------------------------------------------------
    # Conexão com a VPC privada (banco + Redis)
    # ------------------------------------------------------------------
    vpc_access {
      connector = google_vpc_access_connector.portal_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
      # PRIVATE_RANGES_ONLY: apenas tráfego para IPs RFC 1918 vai pelo VPC connector.
      # Tráfego para internet pública (APIs externas) vai pelo Cloud NAT diretamente.
      # Use "ALL_TRAFFIC" se querer IP fixo de saída para todos os destinos.
    }

    containers {
      name  = "portal-api"
      image = var.image_api  # Ex: us-east1-docker.pkg.dev/PROJECT/portal/api:latest

      # ------------------------------------------------------------------
      # Recursos do container
      # ------------------------------------------------------------------
      resources {
        limits = {
          cpu    = "1"      # 1 vCPU por instância
          memory = "512Mi"  # 512 MB RAM — suficiente para NestJS em produção inicial
          # Escale para cpu="2" memory="1Gi" conforme necessidade
        }
        cpu_idle          = true   # Throttle CPU quando a instância está ociosa (economiza custo)
        startup_cpu_boost = true   # CPU extra durante o startup (reduz cold start ~40%)
      }

      # Porta exposta pelo container NestJS
      ports {
        container_port = 3001
        name           = "h2c"   # HTTP/2 cleartext — melhor performance no Cloud Run
      }

      # ------------------------------------------------------------------
      # Variáveis de ambiente NÃO-SECRETAS
      # Valores que podem estar em plaintext (sem informações sensíveis)
      # ------------------------------------------------------------------
      env {
        name  = "PORT"
        value = "3001"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "REDIS_DB"
        value = "1"  # DB lógico 1 — isolado de outros usos do Redis
      }
      env {
        name  = "BULLMQ_PREFIX"
        value = "portal"  # Prefixo de todas as chaves BullMQ
      }
      env {
        name  = "STORAGE_ENDPOINT"
        value = "https://storage.googleapis.com"  # Endpoint GCS com interoperabilidade S3
      }
      env {
        name  = "STORAGE_REGION"
        value = "auto"  # GCS não usa região no SDK S3 — "auto" funciona
      }
      env {
        name  = "STORAGE_BUCKET"
        value = "${var.project_id}-${var.storage_bucket_name}"  # Nome real do bucket com prefixo
      }
      env {
        name  = "STORAGE_FORCE_PATH_STYLE"
        value = "true"  # OBRIGATÓRIO para GCS: usa path-style em vez de virtual-hosted
      }
      env {
        name  = "REDIS_PORT"
        value = "6379"
      }
      env {
        name  = "REDIS_TLS"
        value = "false"  # Memorystore não usa TLS na VPC privada
      }
      env {
        name  = "AUTH_SESSION_TTL"
        value = "8h"  # TTL da sessão JWT — 8 horas para uso durante expediente
      }
      env {
        name  = "IA_MODEL"
        value = "claude-sonnet-4-5"  # Modelo Anthropic para triagem e RAG
      }
      env {
        name  = "EMBEDDINGS_PROVIDER"
        value = "voyage"  # Provider de embeddings: "voyage" ou "openai"
      }

      # ------------------------------------------------------------------
      # Variáveis SECRETAS — injetadas via Secret Manager
      # O Cloud Run busca o valor mais recente do segredo automaticamente.
      # A SA do Cloud Run precisa ter roles/secretmanager.secretAccessor.
      # ------------------------------------------------------------------

      # String de conexão do banco (portal_app — NOSUPERUSER NOBYPASSRLS)
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      # String de conexão somente-leitura (portal_ro)
      env {
        name = "DATABASE_URL_READONLY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url_readonly.secret_id
            version = "latest"
          }
        }
      }

      # Host do Memorystore Redis (IP privado)
      # NOTA: o IP do Redis é um output do redis.tf.
      # Você deve popular este segredo após o apply:
      # terraform output -raw redis_host | gcloud secrets versions add REDIS_HOST --data-file=-
      env {
        name = "REDIS_HOST"
        value_source {
          secret_key_ref {
            secret  = "REDIS_HOST"   # Crie este segredo manualmente após apply
            version = "latest"
          }
        }
      }

      # Senha do Redis (se AUTH habilitado no Memorystore)
      env {
        name = "REDIS_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_password.secret_id
            version = "latest"
          }
        }
      }

      # Chave JWT — mínimo 32 caracteres, gerada aleatoriamente
      env {
        name = "AUTH_JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_jwt_secret.secret_id
            version = "latest"
          }
        }
      }

      # Pepper para hash de CPF (LGPD) — nunca alterar após go-live
      env {
        name = "CPF_PEPPER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.cpf_pepper.secret_id
            version = "latest"
          }
        }
      }

      # HMAC Access Key para GCS (interoperabilidade S3)
      env {
        name = "STORAGE_ACCESS_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.storage_access_key.secret_id
            version = "latest"
          }
        }
      }

      # HMAC Secret para GCS
      env {
        name = "STORAGE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.storage_secret_key.secret_id
            version = "latest"
          }
        }
      }

      # Chave da API Anthropic (IA: triagem, RAG, OCR)
      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.anthropic_api_key.secret_id
            version = "latest"
          }
        }
      }

      # Client Secret do gov.br OIDC (Login Único)
      env {
        name = "GOVBR_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.govbr_client_secret.secret_id
            version = "latest"
          }
        }
      }

      # Senha do SMTP para notificações por e-mail
      env {
        name = "SMTP_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.smtp_password.secret_id
            version = "latest"
          }
        }
      }

      # Chave Voyage AI para embeddings semânticos (pgvector)
      env {
        name = "VOYAGE_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.voyage_api_key.secret_id
            version = "latest"
          }
        }
      }

      # ------------------------------------------------------------------
      # Probes de saúde
      # ------------------------------------------------------------------

      # Startup probe: aguarda a API inicializar completamente
      # O NestJS com muitos módulos pode demorar 10–20s para iniciar.
      startup_probe {
        http_get {
          path = "/api/health/ready"
          port = 3001
        }
        initial_delay_seconds = 10    # Aguarda 10s antes do primeiro check
        period_seconds        = 5     # Checa a cada 5s
        failure_threshold     = 12    # Falha após 12 tentativas (~70s total)
        timeout_seconds       = 3
      }

      # Liveness probe: reinicia o container se travar
      liveness_probe {
        http_get {
          path = "/api/health/ready"
          port = 3001
        }
        initial_delay_seconds = 0
        period_seconds        = 30    # Checa a cada 30s (não sobrecarrega o banco)
        failure_threshold     = 3     # Reinicia após 3 falhas consecutivas (90s)
        timeout_seconds       = 5
      }
    }

    # Timeout máximo de requisição (Cloud Run default: 300s)
    timeout = "300s"

    # Concorrência: requisições simultâneas por instância
    # 80 é o padrão; reduza para workers de fila com processamento pesado
    max_instance_request_concurrency = 80
  }

  # Dependências para garantir a ordem de criação
  depends_on = [
    google_vpc_access_connector.portal_connector,
    google_service_account.portal_cloudrun_sa,
    google_secret_manager_secret.database_url,
    google_secret_manager_secret.auth_jwt_secret,
  ]
}

# ------------------------------------------------------------------
# Cloud Run v2 Service — portal-web (Next.js 14)
# ------------------------------------------------------------------
resource "google_cloud_run_v2_service" "web" {
  name     = "portal-web"
  location = var.region
  project  = var.project_id

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.portal_cloudrun_sa.email

    scaling {
      min_instance_count = var.min_instances_web
      max_instance_count = var.max_instances_web
    }

    vpc_access {
      connector = google_vpc_access_connector.portal_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      name  = "portal-web"
      image = var.image_web

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
          # SSR pesado pode exigir 1Gi; monitore "Memory utilization" no Cloud Monitoring
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 3000
        name           = "h2c"
      }

      # ------------------------------------------------------------------
      # Variáveis do Next.js
      # ------------------------------------------------------------------
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = "3000"
      }
      # URL interna da API (server-side rendering chama a API diretamente)
      # Use a URL interna do Cloud Run para evitar saída pelo Load Balancer
      env {
        name  = "API_URL"
        value = "https://${google_cloud_run_v2_service.api.uri}"
        # Alternativa: use variável externa configurável
        # value = "https://api.${var.domain}"
      }
      # URL pública da API (usada no cliente browser para chamadas client-side)
      env {
        name  = "NEXT_PUBLIC_API_URL"
        value = "https://api.${var.domain}"
      }
      # Domínio principal para resolver o tenant pelo subdomínio
      env {
        name  = "NEXT_PUBLIC_DOMAIN"
        value = var.domain
      }
      # Ambiente para feature flags client-side
      env {
        name  = "NEXT_PUBLIC_ENV"
        value = var.environment
      }

      # Startup probe para aguardar Next.js inicializar
      startup_probe {
        http_get {
          path = "/"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 12
        timeout_seconds       = 3
      }

      liveness_probe {
        http_get {
          path = "/"
          port = 3000
        }
        initial_delay_seconds = 0
        period_seconds        = 30
        failure_threshold     = 3
        timeout_seconds       = 5
      }
    }

    timeout = "60s"   # Next.js SSR não deve demorar mais que 60s
    max_instance_request_concurrency = 80
  }

  depends_on = [
    google_cloud_run_v2_service.api,
    google_vpc_access_connector.portal_connector,
    google_service_account.portal_cloudrun_sa,
  ]
}

# ------------------------------------------------------------------
# IAM — permitir acesso do Load Balancer aos Cloud Run services
# ------------------------------------------------------------------
# O Cloud Load Balancer usa o princípio "allUsers" para acessar o Cloud Run
# quando ingress = INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER.
# O IAM abaixo permite que requisições do LB cheguem aos services.
# A restrição real de acesso é feita pela regra de ingress + Cloud Armor.

resource "google_cloud_run_v2_service_iam_member" "api_lb_invoker" {
  #checkov:skip=CKV_GCP_102:allUsers é exigido pelo Cloud Load Balancer quando ingress=INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER. O acesso real à internet é bloqueado pela regra de ingress — apenas o LB interno consegue invocar o serviço.
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
  # Nota: "allUsers" não significa acesso público à internet.
  # Com ingress=INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER, apenas o
  # Cloud Load Balancer interno pode fazer as chamadas.
}

resource "google_cloud_run_v2_service_iam_member" "web_lb_invoker" {
  #checkov:skip=CKV_GCP_102:allUsers é exigido pelo Cloud Load Balancer quando ingress=INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER. O acesso real à internet é bloqueado pela regra de ingress.
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
