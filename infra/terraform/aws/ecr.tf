# ecr.tf — Elastic Container Registry para imagens Docker do Portal de Prefeitura
#
# Fluxo de uso:
#   1. terraform apply (cria os repositórios)
#   2. docker build + docker tag + docker push (CI/CD ou manual)
#   3. Atualizar var.image_api e var.image_web com as URLs completas
#   4. terraform apply novamente (ECS usa as novas imagens)
#
# Autenticação:
#   aws ecr get-login-password --region us-east-1 | \
#   docker login --username AWS --password-stdin \
#     <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# ---------------------------------------------------------------------------
# Repositório ECR — API NestJS
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}/api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.portal.arn
  }

  tags = {
    Name      = "${var.project_name}-api"
    Componente = "api"
  }
}

# Política de lifecycle do ECR da API
# Mantém as 10 imagens com tag mais recentes; imagens sem tag expiram em 1 dia
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        # Regra 1: expirar imagens sem tag após 1 dia (limpeza de builds intermediários)
        rulePriority = 1
        description  = "Expirar imagens untagged após 1 dia"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        # Regra 2: manter apenas as 10 imagens com tag mais recentes
        rulePriority = 2
        description  = "Manter as 10 imagens tagged mais recentes"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "latest", "release", "staging"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Repositório ECR — Web Next.js
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "web" {
  name                 = "${var.project_name}/web"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.portal.arn
  }

  tags = {
    Name      = "${var.project_name}-web"
    Componente = "web"
  }
}

# Política de lifecycle do ECR do Web (mesma lógica da API)
resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expirar imagens untagged após 1 dia"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Manter as 10 imagens tagged mais recentes"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v", "latest", "release", "staging"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
