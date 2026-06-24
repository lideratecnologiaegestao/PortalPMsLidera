# kms.tf — Customer Managed Key (CMK) para criptografia de dados em repouso
# Usada por: RDS, ElastiCache, ECR, CloudWatch Logs, Secrets Manager, S3

resource "aws_kms_key" "portal" {
  description             = "CMK do Portal de Prefeitura — criptografia em repouso para RDS, Redis, ECR, Logs, Secrets, S3"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  # Key policy (CKV2_AWS_64): conta raiz administra a chave; serviços AWS a usam
  # apenas para cifrar/decifrar os recursos do portal.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccountAdmin"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid    = "AllowAwsServicesUse"
        Effect = "Allow"
        Principal = {
          Service = [
            "rds.amazonaws.com",
            "logs.${var.region}.amazonaws.com",
            "secretsmanager.amazonaws.com",
            "s3.amazonaws.com",
            "elasticache.amazonaws.com",
            "ecr.amazonaws.com"
          ]
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-cmk"
  }
}

resource "aws_kms_alias" "portal" {
  name          = "alias/${var.project_name}-cmk"
  target_key_id = aws_kms_key.portal.key_id
}
