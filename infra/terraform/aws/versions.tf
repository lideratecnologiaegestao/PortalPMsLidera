# versions.tf — restrições de versão do Terraform e providers
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Backend S3 (descomente e configure após criar o bucket de state)
  # backend "s3" {
  #   bucket         = "portal-prefeitura-tfstate"
  #   key            = "aws/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "portal-prefeitura-tflock"
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Projeto   = var.project_name
      ManagedBy = "Terraform"
      Ambiente  = var.environment
    }
  }
}
