# ecs.tf — ECS Cluster, Task Definitions e Services do Portal de Prefeitura
#
# Arquitetura:
#   - ECS Fargate (sem gerenciamento de EC2)
#   - Dois serviços: API NestJS (porta 3001) e Web Next.js (porta 3000)
#   - Segredos injetados via Secrets Manager (sem hardcode de credenciais)
#   - Logs centralizados no CloudWatch Logs

# ---------------------------------------------------------------------------
# Cluster ECS com Container Insights habilitado
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "portal" {
  name = "${var.project_name}-cluster"

  # Container Insights: métricas detalhadas de CPU, memória, rede por task/serviço
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

# Capacity providers Fargate e Fargate Spot
resource "aws_ecs_cluster_capacity_providers" "portal" {
  cluster_name = aws_ecs_cluster.portal.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # Padrão: usar FARGATE (Spot apenas quando explicitamente solicitado)
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project_name}-api"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.portal.arn

  tags = {
    Name      = "/ecs/${var.project_name}-api"
    Componente = "api"
  }
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/${var.project_name}-web"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.portal.arn

  tags = {
    Name      = "/ecs/${var.project_name}-web"
    Componente = "web"
  }
}

# ---------------------------------------------------------------------------
# Task Definition — API NestJS
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.image_api
      essential = true

      portMappings = [
        {
          containerPort = 3001
          protocol      = "tcp"
          name          = "api-http"
        }
      ]

      # Variáveis de ambiente sem segredos (valores não sensíveis)
      environment = [
        { name = "PORT",                    value = "3001" },
        { name = "NODE_ENV",                value = "production" },
        { name = "REDIS_DB",                value = "1" },
        { name = "BULLMQ_PREFIX",           value = "portal" },
        { name = "STORAGE_BUCKET",          value = var.s3_bucket_name },
        { name = "STORAGE_REGION",          value = var.region },
        { name = "STORAGE_FORCE_PATH_STYLE", value = "false" },
        { name = "REDIS_PORT",              value = "6379" },
        { name = "REDIS_TLS",               value = "true" },
        {
          name  = "REDIS_HOST"
          value = aws_elasticache_replication_group.portal.primary_endpoint_address
        },
        {
          name  = "API_URL"
          value = "https://api.${var.domain}"
        }
      ]

      # Segredos injetados do Secrets Manager (valores sensíveis — não aparecem em logs)
      secrets = [
        {
          name      = "AUTH_JWT_SECRET"
          valueFrom = aws_secretsmanager_secret.auth_jwt_secret.arn
        },
        {
          name      = "CPF_PEPPER"
          valueFrom = aws_secretsmanager_secret.cpf_pepper.arn
        },
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.database_url.arn
        },
        {
          name      = "DATABASE_URL_READONLY"
          valueFrom = aws_secretsmanager_secret.database_url_readonly.arn
        },
        {
          name      = "REDIS_PASSWORD"
          valueFrom = aws_secretsmanager_secret.redis_password.arn
        },
        {
          name      = "STORAGE_ACCESS_KEY"
          valueFrom = aws_secretsmanager_secret.storage_access_key.arn
        },
        {
          name      = "STORAGE_SECRET_KEY"
          valueFrom = aws_secretsmanager_secret.storage_secret_key.arn
        },
        {
          name      = "ANTHROPIC_API_KEY"
          valueFrom = aws_secretsmanager_secret.anthropic_api_key.arn
        },
        {
          name      = "GOVBR_CLIENT_ID"
          valueFrom = aws_secretsmanager_secret.govbr_client_id.arn
        },
        {
          name      = "GOVBR_CLIENT_SECRET"
          valueFrom = aws_secretsmanager_secret.govbr_client_secret.arn
        },
        {
          name      = "SMTP_PASS"
          valueFrom = aws_secretsmanager_secret.smtp_pass.arn
        },
        {
          name      = "DIARIO_SIGNING_KEY"
          valueFrom = aws_secretsmanager_secret.diario_signing_key.arn
        }
      ]

      # Health check do contêiner (independente do ALB health check)
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3001/api/health/ready || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60 # aguarda 60s para o NestJS inicializar antes do primeiro check
      }

      # Configuração de logs para CloudWatch
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "api"
        }
      }

      # Limites de recursos — impede que um contêiner monopolize a task
      ulimits = [
        {
          name      = "nofile"
          softLimit = 65536
          hardLimit = 65536
        }
      ]
    }
  ])

  tags = {
    Name      = "${var.project_name}-api-task"
    Componente = "api"
  }
}

# ---------------------------------------------------------------------------
# Task Definition — Web Next.js
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project_name}-web"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = var.image_web
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
          name          = "web-http"
        }
      ]

      # O Web Next.js precisa apenas da URL da API — sem credenciais de banco, Redis ou S3
      environment = [
        { name = "PORT",                    value = "3000" },
        { name = "NODE_ENV",                value = "production" },
        # URL interna da API (server-side rendering — SSR)
        { name = "API_URL",                 value = "https://api.${var.domain}" },
        # URL pública da API (acessada pelo browser do cidadão)
        { name = "NEXT_PUBLIC_API_URL",     value = "https://api.${var.domain}" },
        # Domínio base para roteamento multi-tenant por Host
        { name = "NEXT_PUBLIC_BASE_DOMAIN", value = var.domain }
      ]

      # O Web Next.js não precisa de secrets sensíveis da API
      # Se necessário para analytics ou funcionalidades futuras, adicione aqui
      secrets = []

      # Health check do Next.js
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])

  tags = {
    Name      = "${var.project_name}-web-task"
    Componente = "web"
  }
}

# ---------------------------------------------------------------------------
# ECS Service — API NestJS
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.portal.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"

  # Configuração de rede — subnets privadas com o SG dos contêineres ECS
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false # contêineres ficam em subnets privadas (acessam internet via NAT)
  }

  # Integração com o ALB — registra as tasks no target group da API
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  # Estratégia de deployment (rolling update padrão do ECS)
  deployment_controller {
    type = "ECS"
  }

  # Configuração de deployment rolling
  deployment_minimum_healthy_percent = 50  # mantém pelo menos 50% das tasks saudáveis
  deployment_maximum_percent         = 200 # permite até 2x o desired_count durante deployment

  # Aguarda o serviço estabilizar após mudanças
  wait_for_steady_state = false # habilite em pipelines CI/CD para esperar o deployment

  # force_new_deployment = false (padrão)
  # Use `terraform apply -var="force_new_deployment=true"` ou force via console/CLI
  # para forçar novo deployment sem mudança na task definition

  # O serviço só sobe após o listener HTTPS estar pronto
  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.ecs_execution_managed,
    aws_iam_role_policy_attachment.ecs_execution_secrets,
  ]

  tags = {
    Name      = "${var.project_name}-api-service"
    Componente = "api"
  }

  lifecycle {
    # Ignora mudanças externas no desired_count (ex: feitas por Auto Scaling)
    ignore_changes = [desired_count]
  }
}

# ---------------------------------------------------------------------------
# ECS Service — Web Next.js
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "web" {
  name            = "${var.project_name}-web"
  cluster         = aws_ecs_cluster.portal.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.web_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  deployment_controller {
    type = "ECS"
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  wait_for_steady_state = false

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.ecs_execution_managed,
    aws_iam_role_policy_attachment.ecs_execution_secrets,
  ]

  tags = {
    Name      = "${var.project_name}-web-service"
    Componente = "web"
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
