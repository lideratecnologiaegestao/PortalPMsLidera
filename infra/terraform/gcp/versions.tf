terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Descomente e configure o backend GCS para armazenar o state de forma compartilhada.
  # Crie o bucket manualmente antes de rodar terraform init:
  #   gcloud storage buckets create gs://meu-projeto-tfstate --location=us-east1
  # backend "gcs" {
  #   bucket = "meu-projeto-tfstate"
  #   prefix = "portal-prefeitura/terraform.tfstate"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}
