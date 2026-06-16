# redis.tf — ElastiCache Redis 7 para BullMQ e cache de sessão do Portal de Prefeitura
#
# Configuração:
#   - REDIS_DB=1 (banco separado do Redis compartilhado da infraestrutura Lidera)
#   - BULLMQ_PREFIX=portal (prefixo das filas BullMQ — ver queue.constants.ts)
#   - Conexão com maxRetriesPerRequest: null e enableReadyCheck: false (padrão BullMQ)
#   - TLS obrigatório (transit_encryption_enabled=true) — REDIS_TLS=true na task ECS

# ---------------------------------------------------------------------------
# Subnet Group — ElastiCache em subnets privadas
# ---------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "portal" {
  name        = "${var.project_name}-redis-subnet-group"
  description = "Subnet group do ElastiCache Redis Portal — subnets privadas em múltiplas AZs"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-redis-subnet-group"
  }
}

# ---------------------------------------------------------------------------
# Replication Group Redis 7
# ---------------------------------------------------------------------------
# Para produção com alta disponibilidade:
#   - Aumentar num_cache_clusters para 2 (um primário + um réplica)
#   - Habilitar automatic_failover_enabled = true
#   - Considerar multi_az_enabled = true
#   - Trocar node_type para cache.t3.small ou superior

resource "aws_elasticache_replication_group" "portal" {
  replication_group_id = "${var.project_name}-redis"
  description          = "Redis 7 para BullMQ e cache do portal"

  # Versão do motor
  engine_version = "7.0"

  # Tipo de nó (configurável via variável)
  node_type = var.redis_node_type

  # Número de nós no cluster
  # num_cache_clusters=1: apenas primário (sem réplica)
  # Para produção, aumentar para 2 e habilitar automatic_failover_enabled
  num_cache_clusters = 1

  # Porta padrão do Redis
  port = 6379

  # Rede
  subnet_group_name  = aws_elasticache_subnet_group.portal.name
  security_group_ids = [aws_security_group.redis.id]

  # Criptografia em repouso (AES-256)
  at_rest_encryption_enabled = true

  # Criptografia em trânsito (TLS) — exige auth_token
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  # Failover automático requer no mínimo 2 nós
  automatic_failover_enabled = false

  # Janela de manutenção semanal (madrugada de domingo)
  maintenance_window = "sun:05:00-sun:06:00"

  # Janela de backup automático do Redis (snapshots diários)
  snapshot_window          = "04:00-05:00"
  snapshot_retention_limit = 3 # manter 3 snapshots diários

  # Aplicar mudanças de configuração na próxima janela de manutenção (não imediatamente)
  apply_immediately = false

  # Habilitar atualizações automáticas de versão minor
  auto_minor_version_upgrade = true

  tags = {
    Name = "${var.project_name}-redis"
  }
}
