# ============================================================
# database.tf — Cloud SQL for PostgreSQL 16 + PostGIS
# Portal de Prefeitura (SaaS multi-tenant)
#
# CRÍTICO — RLS:
#   Os usuários portal_app e portal_ro são criados com
#   NOSUPERUSER e NOBYPASSRLS. Isso é OBRIGATÓRIO para que
#   o Row Level Security funcione corretamente.
#
#   Nota GCP: o usuário "cloudsqlsuperuser" do Cloud SQL
#   NÃO tem o privilégio SUPERUSER real do PostgreSQL.
#   A GCP remove esse privilégio internamente para preservar
#   o isolamento. Portanto, mesmo o superusuário do Cloud SQL
#   RESPEITA as policies de RLS — o que é uma proteção adicional
#   em relação a instâncias PostgreSQL auto-gerenciadas.
#
# CRÍTICO — PostGIS:
#   A extensão PostGIS (e pgvector) deve ser instalada MANUALMENTE
#   após o provisionamento via Cloud SQL Auth Proxy:
#
#   psql -h 127.0.0.1 -p 5433 -U postgres -d portal -c \
#     "CREATE EXTENSION IF NOT EXISTS postgis;
#      CREATE EXTENSION IF NOT EXISTS pgcrypto;
#      CREATE EXTENSION IF NOT EXISTS vector;"
#
#   O Terraform não gerencia extensões PostgreSQL diretamente.
# ============================================================

# ------------------------------------------------------------------
# Instância Cloud SQL — PostgreSQL 16
# ------------------------------------------------------------------
resource "google_sql_database_instance" "portal_postgres" {
  #checkov:skip=CKV_GCP_79:stack padronizada em PostgreSQL 16 (compatibilidade PostGIS/pgvector); upgrade de major é avaliado separadamente
  name             = "portal-postgres"
  database_version = "POSTGRES_16"
  region           = var.region
  project          = var.project_id

  # Impede destruição acidental do banco em produção.
  # Para destruir: primeiro defina como false, aplique, depois destrua.
  deletion_protection = true

  # CMEK — Customer-Managed Encryption Key (argumento do nível da instância).
  encryption_key_name = google_kms_crypto_key.cloudsql.id

  settings {
    tier              = var.db_tier       # Ex: db-custom-2-4096 (2 vCPU, 4 GB RAM)
    availability_type = "REGIONAL"        # Alta disponibilidade com failover automático em produção
                                          # Use ZONAL em dev/staging para economizar ~50%

    disk_type       = "PD_SSD"            # SSD para melhor performance de I/O
    disk_size       = 20                  # GB — inicia com 20 GB; escale conforme crescimento
    disk_autoresize = true                # Aumenta disco automaticamente quando > 90% cheio
    disk_autoresize_limit = 500           # Limite máximo de auto-resize em GB

    # ----------------------------------------------------------------
    # Rede — APENAS IP privado (sem exposição à internet)
    # ----------------------------------------------------------------
    ip_configuration {
      ipv4_enabled                                  = false  # Sem IP público — obrigatório para segurança
      private_network                               = google_compute_network.portal_vpc.id
      enable_private_path_for_google_cloud_services = true   # Permite acesso via Private Google Access
      require_ssl                                   = true   # Exige TLS para todas as conexões (CKV_GCP_6)

      # Sem authorized_networks — o banco é acessível APENAS via VPC privada
    }

    # ----------------------------------------------------------------
    # Backups e PITR (Point-in-Time Recovery)
    # ----------------------------------------------------------------
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true   # Permite restaurar para qualquer momento nos últimos 7 dias
      start_time                     = "03:00" # Janela de backup às 3h (horário da região — menor carga)
      transaction_log_retention_days = 7       # Retém logs de transação por 7 dias para PITR
      backup_retention_settings {
        retained_backups = 7          # Mantém 7 backups automáticos
        retention_unit   = "COUNT"
      }
    }

    # ----------------------------------------------------------------
    # Manutenção planejada
    # ----------------------------------------------------------------
    maintenance_window {
      day          = 7    # Domingo
      hour         = 4    # 4h da manhã (menor tráfego)
      update_track = "stable"
    }

    # ----------------------------------------------------------------
    # Insights de query (Query Insights)
    # Auxilia no diagnóstico de queries lentas sem overhead significativo
    # ----------------------------------------------------------------
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024  # Tamanho máximo da query logada
      record_application_tags = true
      record_client_address   = false # Não registra IP do cliente (LGPD)
    }

    # ----------------------------------------------------------------
    # Flags do PostgreSQL
    # Ajustam comportamento do servidor para performance e auditoria
    # ----------------------------------------------------------------
    database_flags {
      name  = "max_connections"
      value = "200"
      # Pool de conexões: API usa connection pool via Prisma.
      # 200 é seguro para db-custom-2-4096. Se usar pgbouncer, pode reduzir.
    }

    database_flags {
      name  = "cloudsql.enable_pgaudit"
      value = "on"
      # pgaudit loga todas as queries DDL e DML para auditoria.
      # Os logs ficam disponíveis no Cloud Logging.
      # Essencial para compliance LGPD e auditoria de segurança.
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "-1"
      # CKV_GCP_57: '-1' desabilita o log do TEXTO de statements por duração (pode
      # conter dado sensível). Diagnóstico de query lenta fica por Query Insights
      # (insights_config acima), sem expor o SQL nos logs.
    }

    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
      # CKV_GCP_84: log_connections deve estar "on" para auditoria de acesso ao banco.
      # Em produção com alto volume de conexões, monitore o custo de Cloud Logging.
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
      # CKV_GCP_85: log_disconnections deve estar "on" para auditoria de acesso ao banco.
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
      # Loga quando uma query aguarda mais de deadlock_timeout (1s padrão) por um lock.
      # Fundamental para diagnosticar deadlocks em operações concorrentes de RLS.
    }

    database_flags {
      name  = "work_mem"
      value = "16384"
      # 16 MB por operação de sort/hash. Razoável para 200 conexões + 4 GB RAM.
      # Aumente para queries analíticas pesadas do módulo de Transparência.
    }

    database_flags {
      name  = "shared_buffers"
      value = "1024"
      # 1 GB de shared_buffers (25% da RAM). Padrão seguro para 4 GB RAM.
    }

    # Flags de auditoria exigidas pelo Checkov (CKV_GCP_108/109/111, CKV2_GCP_13)
    database_flags {
      name  = "log_hostname" # CKV_GCP_108
      value = "on"
    }
    database_flags {
      name  = "log_min_error_statement" # CKV_GCP_109 (ERROR ou inferior)
      value = "error"
    }
    database_flags {
      name  = "log_statement" # CKV_GCP_111 (loga DDL)
      value = "ddl"
    }
    database_flags {
      name  = "log_duration" # CKV2_GCP_13
      value = "on"
    }
  }

  depends_on = [google_service_networking_connection.private_service_connection]
}

# ------------------------------------------------------------------
# Banco de dados "portal"
# ------------------------------------------------------------------
resource "google_sql_database" "portal_db" {
  name     = var.db_name    # "portal"
  instance = google_sql_database_instance.portal_postgres.name
  project  = var.project_id
  charset  = "UTF8"
  collation = "en_US.UTF8"
}

# ------------------------------------------------------------------
# Usuário da aplicação — portal_app
# ------------------------------------------------------------------
# OBRIGATÓRIO: este usuário deve ser NOSUPERUSER NOBYPASSRLS.
# O Cloud SQL cria o usuário com estas flags por padrão (diferente do
# PostgreSQL auto-gerenciado onde o criador pode ter BYPASSRLS).
#
# O PrismaService da API usa este usuário para TODAS as operações
# de leitura/escrita dos tenants. O SET LOCAL app.current_tenant_id
# na transação ativa as policies de RLS.
resource "google_sql_user" "portal_app" {
  name     = var.db_user_app        # "portal_app"
  instance = google_sql_database_instance.portal_postgres.name
  project  = var.project_id
  password = var.db_password_app    # Senha via variável sensitive — use Secret Manager

  # Após apply, execute via psql para garantir flags corretas:
  # ALTER ROLE portal_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
}

# ------------------------------------------------------------------
# Usuário somente-leitura — portal_ro
# ------------------------------------------------------------------
# Usado para:
# - DATABASE_URL_READONLY no NestJS (queries de relatório)
# - Ferramentas de BI/analytics (Metabase, Superset)
# - Exports de transparência pública (sem risco de modificação)
resource "google_sql_user" "portal_ro" {
  name     = var.db_user_readonly   # "portal_ro"
  instance = google_sql_database_instance.portal_postgres.name
  project  = var.project_id
  password = var.db_password_ro     # Senha via variável sensitive — use Secret Manager

  # Após apply, execute via psql:
  # ALTER ROLE portal_ro NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  # GRANT CONNECT ON DATABASE portal TO portal_ro;
  # GRANT USAGE ON SCHEMA public TO portal_ro;
  # GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
}

# ------------------------------------------------------------------
# Outputs locais (usados por outros módulos)
# ------------------------------------------------------------------
# O connection name é necessário para o Cloud SQL Auth Proxy
# e para configurar o Cloud Run com a instância correta.
