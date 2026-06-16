# database.tf — RDS PostgreSQL 16 para o Portal de Prefeitura
#
# IMPORTANTE — Pós-apply (conectar via Session Manager ou bastion):
#
#   1. Conectar ao RDS com o usuário master:
#      psql "postgresql://<db_username>:<db_password>@<rds_endpoint>:5432/portal"
#
#   2. Instalar as extensões necessárias (requer superuser ou rds_superuser):
#      CREATE EXTENSION IF NOT EXISTS postgis;
#      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
#      CREATE EXTENSION IF NOT EXISTS vector;  -- para busca semântica RAG (pgvector)
#
#   3. Criar roles da aplicação (NOSUPERUSER + NOBYPASSRLS para garantir RLS):
#      CREATE ROLE portal_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD 'SENHA_FORTE';
#      CREATE ROLE portal_ro  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD 'SENHA_FORTE';
#      GRANT CONNECT ON DATABASE portal TO portal_app, portal_ro;
#
#   4. Rodar as 62 migrations em ordem (ver README.md para o comando completo):
#      for f in $(ls db/*.sql | sort); do psql "$DATABASE_URL" -f "$f"; done
#
#   AVISO: O master user do RDS NÃO é superuser no PostgreSQL (flag NOSUPERUSER padrão AWS).
#   Isso é intencional — preserva o RLS mesmo para o master user da aplicação.

# ---------------------------------------------------------------------------
# Parameter Group com SSL obrigatório
# ---------------------------------------------------------------------------

resource "aws_db_parameter_group" "portal" {
  name        = "${var.project_name}-pg16"
  family      = "postgres16"
  description = "Parameter group do Portal de Prefeitura — PostgreSQL 16 com SSL obrigatório"

  # Força conexões SSL/TLS — nenhum cliente aceita conexão em texto plano
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Log de conexões para auditoria de acesso
  parameter {
    name  = "log_connections"
    value = "1"
  }

  # Log de desconexões para detectar conexões abertas e abandonadas
  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Name = "${var.project_name}-pg16-params"
  }
}

# ---------------------------------------------------------------------------
# Subnet Group — RDS em subnets privadas (sem acesso público)
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "portal" {
  name        = "${var.project_name}-db-subnet-group"
  description = "Subnet group do RDS Portal — subnets privadas em múltiplas AZs"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# ---------------------------------------------------------------------------
# Instância RDS PostgreSQL 16
# ---------------------------------------------------------------------------

resource "aws_db_instance" "portal" {
  identifier = "${var.project_name}-postgres"

  # Motor e versão
  engine         = "postgres"
  engine_version = "16"

  # Tamanho da instância (configurável via variável)
  instance_class = var.db_instance_class

  # Banco de dados inicial
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password # sensível — não aparece em logs do Terraform

  # Rede e segurança
  db_subnet_group_name   = aws_db_subnet_group.portal.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false # banco NUNCA exposto à internet

  # Alta disponibilidade (desligado por padrão para reduzir custo em dev/staging)
  multi_az = var.db_multi_az

  # Backups automáticos
  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00" # janela de backup às 3h UTC (madrugada BR)
  maintenance_window      = "sun:04:00-sun:05:00" # manutenção aos domingos às 4h UTC

  # Armazenamento — gp3 com autoscaling para evitar disco cheio
  storage_type          = "gp3"
  allocated_storage     = 20  # GB inicial
  max_allocated_storage = 100 # GB máximo (autoscaling automático do RDS)
  storage_encrypted     = true

  # Parameter group com SSL obrigatório
  parameter_group_name = aws_db_parameter_group.portal.name

  # Proteção contra exclusão acidental (terraform destroy requer deletion_protection=false antes)
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-final-snapshot"

  # Atualizações automáticas de versão minor (patches de segurança)
  auto_minor_version_upgrade = true

  # Habilitar monitoramento aprimorado (métricas a cada 60s)
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  # Performance Insights — visibilidade de queries lentas
  performance_insights_enabled          = true
  performance_insights_retention_period = 7 # dias (free tier)

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

# ---------------------------------------------------------------------------
# IAM Role para Enhanced Monitoring do RDS
# ---------------------------------------------------------------------------

resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-rds-monitoring-role"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}
