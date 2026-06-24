# iam.tf — Roles e políticas IAM para ECS e S3 do Portal de Prefeitura

# ---------------------------------------------------------------------------
# Role de Execução ECS (ECS Execution Role)
# Usada pelo agente Fargate para: baixar imagens do ECR, injetar segredos do
# Secrets Manager nas tasks, e enviar logs ao CloudWatch.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSTasksAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-ecs-execution-role"
    Modulo  = "ecs"
    Funcao  = "execucao"
  }
}

# Política gerenciada AWS para execução de tasks ECS (ECR pull + CloudWatch logs)
resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Política customizada: permite leitura dos segredos do portal no Secrets Manager
resource "aws_iam_policy" "ecs_execution_secrets" {
  name        = "${var.project_name}-ecs-secrets-policy"
  description = "Permite que o agente ECS leia os segredos do portal no Secrets Manager para injeção nas tasks"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LerSegredosDoPortal"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        # Restringe ao prefixo "portal/" — evita acesso cross-secret
        Resource = "arn:aws:secretsmanager:${var.region}:*:secret:portal/*"
      },
      {
        Sid    = "DecriptarSegredosKMS"
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        # Necessário se os segredos usarem CMK KMS personalizada (hoje usam KMS gerenciada pela AWS)
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-secrets-policy"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_execution_secrets" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = aws_iam_policy.ecs_execution_secrets.arn
}

# ---------------------------------------------------------------------------
# Role da Task ECS (ECS Task Role)
# Usada PELO CÓDIGO DA APLICAÇÃO em tempo de execução para acessar S3.
# Diferente da Execution Role (usada pelo agente Fargate antes do container subir).
# ---------------------------------------------------------------------------

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSTasksAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name   = "${var.project_name}-ecs-task-role"
    Modulo = "ecs"
    Funcao = "task"
  }
}

# Política S3 para a Task ECS (aplicação NestJS)
# Permite operações de leitura/escrita/exclusão no bucket portal
resource "aws_iam_policy" "ecs_task_s3" {
  name        = "${var.project_name}-ecs-task-s3-policy"
  description = "Permite que a task ECS acesse o bucket S3 do portal para upload/download de arquivos"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "OperacoesObjetos"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/*"
      },
      {
        Sid    = "ListarBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ecs-task-s3-policy"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_s3" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task_s3.arn
}

# ---------------------------------------------------------------------------
# IAM User dedicado para acesso ao S3 via SDK (portal_s3_user)
#
# Este usuário fornece as credenciais STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY
# usadas pelo NestJS para integração com o S3 (lib @aws-sdk/client-s3).
#
# IMPORTANTE: Gere as access keys via console ou CLI e armazene no Secrets Manager:
#   aws iam create-access-key --user-name portal-s3-app
#   aws secretsmanager put-secret-value --secret-id portal/storage-access-key --secret-string 'AKID...'
#   aws secretsmanager put-secret-value --secret-id portal/storage-secret-key --secret-string 'SECRET...'
#
# Prefira usar a ECS Task Role (aws_iam_role.ecs_task) quando possível,
# pois não requer rotação manual de credenciais.
# ---------------------------------------------------------------------------

resource "aws_iam_user" "s3_app" {
  #checkov:skip=CKV_AWS_273:IAM user dedicado para credenciais S3 da aplicação NestJS — o SDK usa access keys estáticas (STORAGE_ACCESS_KEY/SECRET) que não usam instance profiles
  name = "${var.project_name}-s3-app"
  path = "/portal/"

  tags = {
    Name      = "${var.project_name}-s3-app"
    Descricao = "IAM user para credenciais S3 da aplicacao NestJS (STORAGE_ACCESS_KEY/SECRET)"
  }
}

# Política inline do IAM user S3
resource "aws_iam_user_policy" "s3_app" {
  #checkov:skip=CKV_AWS_40:policy inline do IAM user S3 dedicado (intencional; o SDK precisa de access keys estáticas, não role)
  name = "${var.project_name}-s3-app-policy"
  user = aws_iam_user.s3_app.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "OperacoesObjetos"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/*"
      },
      {
        Sid    = "ListarBucket"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = "arn:aws:s3:::${var.s3_bucket_name}"
      }
    ]
  })
}
