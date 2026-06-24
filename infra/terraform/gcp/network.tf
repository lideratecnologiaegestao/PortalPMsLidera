# ============================================================
# network.tf — VPC, subnets, Private Service Access,
#              Serverless VPC Access Connector, NAT
# Portal de Prefeitura (SaaS multi-tenant)
# ============================================================

# ------------------------------------------------------------------
# VPC principal
# ------------------------------------------------------------------
# Uma VPC dedicada isola os recursos do Portal dos outros projetos GCP.
# auto_create_subnetworks=false permite controle explícito dos ranges.
resource "google_compute_network" "portal_vpc" {
  name                    = "portal-vpc"
  auto_create_subnetworks = false
  description             = "VPC dedicada ao Portal de Prefeitura. Cloud SQL e Memorystore ficam acessíveis somente via esta rede."
  project                 = var.project_id
}

# ------------------------------------------------------------------
# Subnet principal — Cloud Run, workloads
# ------------------------------------------------------------------
# Range 10.0.0.0/20 comporta até 4094 hosts.
# Cloud Run Serverless não usa esta subnet diretamente, mas o conector VPC sim.
resource "google_compute_subnetwork" "portal_subnet" {
  name                     = "portal-subnet"
  ip_cidr_range            = "10.0.0.0/20"
  region                   = var.region
  network                  = google_compute_network.portal_vpc.id
  project                  = var.project_id
  private_ip_google_access = true # Permite acesso às APIs Google sem IP público

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# ------------------------------------------------------------------
# Private Service Access — Cloud SQL e Memorystore
# ------------------------------------------------------------------
# O Private Service Access cria um peering de VPC entre a rede do projeto
# e a rede gerenciada do Google para Cloud SQL e Memorystore.
# Isso garante que o banco e o Redis tenham IPs internos (RFC 1918)
# e NUNCA fiquem expostos à internet pública.

resource "google_compute_global_address" "private_service_range" {
  name          = "portal-private-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16            # /16 = range 10.1.0.0/16 para serviços gerenciados
  network       = google_compute_network.portal_vpc.id
  project       = var.project_id
  description   = "Range de IPs reservado para Private Service Access (Cloud SQL, Memorystore)"
}

resource "google_service_networking_connection" "private_service_connection" {
  network                 = google_compute_network.portal_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]

  # Aguarda o range ser criado antes de estabelecer o peering
  depends_on = [google_compute_global_address.private_service_range]
}

# ------------------------------------------------------------------
# Serverless VPC Access Connector
# ------------------------------------------------------------------
# O Cloud Run é serverless e roda fora da VPC por padrão.
# O conector é o bridge que permite ao Cloud Run alcançar
# recursos com IP privado (Cloud SQL, Memorystore).
#
# CIDR /28: suporta até 100 instâncias Cloud Run simultâneas.
# Escolha um range que não sobreponha outros da VPC.
# Custo: ~$0,01/hora mesmo sem tráfego (mantenha só um por região).
resource "google_vpc_access_connector" "portal_connector" {
  name          = "portal-connector"
  region        = var.region
  project       = var.project_id
  network       = google_compute_network.portal_vpc.name
  ip_cidr_range = var.vpc_connector_cidr # default: "10.8.0.0/28"

  min_instances = 2 # Mínimo 2 para HA; o Cloud Run escala o conector automaticamente
  max_instances = 10
  machine_type  = "e2-micro" # Suficiente para a maioria dos casos; use e2-standard-4 para alto throughput

  depends_on = [google_compute_network.portal_vpc]
}

# ------------------------------------------------------------------
# Cloud Router — necessário para o Cloud NAT
# ------------------------------------------------------------------
# O Cloud Router anuncia rotas e gerencia sessões BGP para o NAT.
resource "google_compute_router" "portal_router" {
  name    = "portal-router"
  region  = var.region
  network = google_compute_network.portal_vpc.id
  project = var.project_id

  bgp {
    asn = 64514 # ASN privado RFC 6996; qualquer valor 64512-65534 serve
  }
}

# ------------------------------------------------------------------
# Cloud NAT — saída de internet para Cloud Run
# ------------------------------------------------------------------
# Cloud Run precisa de saída para internet para:
# - Chamar APIs externas (Anthropic, gov.br OIDC, Voyage, SMTP)
# - Baixar atualizações de packages em runtime (se necessário)
# O NAT garante IP de saída estável (útil para allowlists de APIs externas).
resource "google_compute_router_nat" "portal_nat" {
  name                               = "portal-nat"
  router                             = google_compute_router.portal_router.name
  region                             = var.region
  project                            = var.project_id
  nat_ip_allocate_option             = "AUTO_ONLY" # GCP aloca IPs NAT automaticamente
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY" # Loga apenas erros NAT (tradução de IP falhou)
  }
}

# ------------------------------------------------------------------
# Firewall rules
# ------------------------------------------------------------------

# Permitir health checks do Load Balancer (ranges fixos do GCP)
resource "google_compute_firewall" "allow_lb_health_checks" {
  name    = "portal-allow-lb-health-checks"
  network = google_compute_network.portal_vpc.name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3000", "3001"]
  }

  # Ranges fixos dos health checkers do Google Cloud Load Balancing
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["portal-cloudrun"]
  description   = "Permite health checks do Cloud Load Balancer para os Cloud Run services"

  # Logging de regra de firewall (CKV_GCP_74 / CKV_GCP_75)
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Negar todo tráfego de entrada não autorizado (deny-all default já existe na VPC,
# mas tornamos explícito para auditoria)
resource "google_compute_firewall" "deny_all_ingress" {
  name      = "portal-deny-all-ingress"
  network   = google_compute_network.portal_vpc.name
  project   = var.project_id
  priority  = 65534
  direction = "INGRESS"

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  description   = "Regra de negação padrão (menor prioridade). Todo tráfego não explicitamente permitido é negado."

  # Logging de regra de firewall (CKV_GCP_74 / CKV_GCP_75)
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}
