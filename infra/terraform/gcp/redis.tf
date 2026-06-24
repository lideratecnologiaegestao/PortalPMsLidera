# ============================================================
# redis.tf — Memorystore for Redis 7
# Portal de Prefeitura (SaaS multi-tenant)
#
# Uso no projeto:
#   - Filas BullMQ 5 (processamento assíncrono: e-mails, SLA,
#     OCR, embeddings IA, WhatsApp, relatórios de transparência)
#   - Cache de sessão e dados de tenant
#   - Pub/Sub interno (Socket.IO para chat e atendimento)
#
# Configuração obrigatória da aplicação:
#   REDIS_DB=1              — DB lógico 1 (isola de outros usos)
#   BULLMQ_PREFIX=portal    — prefixo de todas as chaves BullMQ
#   maxRetriesPerRequest: null    — obrigatório para BullMQ 5
#   enableReadyCheck: false       — obrigatório para BullMQ 5
#
# A conexão Redis deve usar ioredis com estes parâmetros exatos.
# Ver: api/src/common/queue/queue.constants.ts
# ============================================================

resource "google_redis_instance" "portal_redis" {
  name           = "portal-redis"
  display_name   = "Portal Prefeitura — Redis 7 (BullMQ + Cache)"
  project        = var.project_id
  region         = var.region
  redis_version  = "REDIS_7_0"

  # ------------------------------------------------------------------
  # Capacidade de memória
  # ------------------------------------------------------------------
  memory_size_gb = var.redis_memory_gb  # default: 1 GB
  # Monitore a métrica "used_memory" no Cloud Monitoring.
  # Escale verticalmente se used_memory > 70% do total.
  # Estrutura de uso esperado por GB:
  #   - BullMQ jobs ativos: ~50 MB por 10k jobs
  #   - Cache de tenants: ~10 MB por 100 tenants
  #   - Socket.IO rooms: ~5 MB por 1.000 conexões ativas

  # ------------------------------------------------------------------
  # Tier de disponibilidade
  # ------------------------------------------------------------------
  tier = var.redis_tier
  # STANDARD_HA (produção):
  #   - Réplica em zona diferente com failover automático (~30s)
  #   - SLA 99,9% de disponibilidade
  #   - Custo ~2x do BASIC
  # BASIC (dev/staging):
  #   - Sem réplica, sem failover automático
  #   - Adequado para ambientes não-críticos
  #   - Custo mais baixo

  # ------------------------------------------------------------------
  # Segurança — autenticação e criptografia em trânsito
  # ------------------------------------------------------------------
  auth_enabled            = true                   # CKV_GCP_97: exige AUTH (requirepass) no Redis
  transit_encryption_mode = "SERVER_AUTHENTICATION" # CKV_GCP_98: TLS obrigatório em trânsito

  # ------------------------------------------------------------------
  # Conectividade — APENAS via VPC privada
  # ------------------------------------------------------------------
  connect_mode        = "PRIVATE_SERVICE_ACCESS"
  # O Redis ficará acessível apenas via IP privado na VPC portal-vpc.
  # Cloud Run acessa via Serverless VPC Access Connector.
  # Nunca exposto à internet.

  authorized_network  = google_compute_network.portal_vpc.id
  reserved_ip_range   = google_compute_global_address.private_service_range.name

  # ------------------------------------------------------------------
  # Configurações do Redis
  # ------------------------------------------------------------------
  redis_configs = {
    # Política de eviction quando a memória está cheia.
    # allkeys-lru: remove as chaves menos recentemente usadas.
    # Adequado para cache; para filas use noeviction (nunca remove jobs).
    # ATENÇÃO: se usar Redis só para filas, mude para "noeviction"
    # e configure alertas de memória para escalar antes de encher.
    "maxmemory-policy" = "allkeys-lru"

    # Persistência: desabilitada por padrão no Memorystore BASIC.
    # No STANDARD_HA, o Memorystore gerencia a persistência internamente.
    # Para garantir durabilidade dos jobs BullMQ em restart, configure
    # persistence mode AOF via console (não disponível no Terraform ainda).
    "activedefrag" = "yes"   # Desfragmentação ativa de memória
    "hz"           = "15"    # Frequência de tarefas background (padrão: 10)
  }

  # ------------------------------------------------------------------
  # Janela de manutenção
  # ------------------------------------------------------------------
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 3
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  depends_on = [google_service_networking_connection.private_service_connection]

  # ------------------------------------------------------------------
  # Nota sobre autenticação Redis
  # ------------------------------------------------------------------
  # auth_enabled = true está configurado acima (bloco de segurança).
  # A senha é gerada automaticamente pelo Memorystore.
  # Recupere via: gcloud redis instances get-auth-string portal-redis --region=us-east1
  # Armazene no Secret Manager como REDIS_PASSWORD (já criado em secrets.tf).
  #
  # transit_encryption_mode = "SERVER_AUTHENTICATION" exige que o cliente use TLS.
  # Configure REDIS_TLS=true na aplicação ao usar este modo.
}
