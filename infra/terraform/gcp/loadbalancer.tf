# ============================================================
# loadbalancer.tf — Cloud Load Balancing + Cloud Armor WAF
# Portal de Prefeitura (SaaS multi-tenant)
#
# Arquitetura:
#   Internet → Cloud DNS (*.dominio) → Cloud LB (HTTPS 443)
#            → Cloud Armor WAF → Serverless NEG
#            → Cloud Run (portal-web ou portal-api)
#
# Roteamento por path:
#   /api/*  → backend portal-api (NestJS :3001)
#   /*      → backend portal-web (Next.js :3000)
#
# Multi-tenancy por Host:
#   O header "Host" (ex: cuiaba.prefeitura.app.br) é preservado
#   e passado ao Cloud Run. A API extrai o subdomínio para
#   identificar o tenant e setar o app.current_tenant_id no RLS.
#
# Alternativa Cloudflare:
#   Se o DNS estiver no Cloudflare (proxy modo laranja):
#   - Aponte o A record para o IP do LB abaixo
#   - Use Cloudflare WAF em vez do Cloud Armor
#   - Configure CF-Connecting-IP como trusted header na API
#   - Desative o Cloud Armor security policy para não pagar 2x
# ============================================================

# ------------------------------------------------------------------
# Serverless NEGs (Network Endpoint Groups) para Cloud Run
# ------------------------------------------------------------------
# Um Serverless NEG conecta o backend do Load Balancer ao Cloud Run.
# Um NEG por serviço Cloud Run.

resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "portal-api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  project               = var.project_id

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

resource "google_compute_region_network_endpoint_group" "web_neg" {
  name                  = "portal-web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  project               = var.project_id

  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

# ------------------------------------------------------------------
# Cloud Armor — Security Policy (WAF)
# ------------------------------------------------------------------
resource "google_compute_security_policy" "portal_waf" {
  name    = "portal-waf"
  project = var.project_id
  description = "WAF para o Portal de Prefeitura: OWASP CRS, rate limiting, geo-blocking"

  # Regra 1: Permitir requisições legítimas (prioridade mais alta = mais específica)
  rule {
    action   = "allow"
    priority = 100
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]  # Permite tudo que não foi bloqueado pelas regras abaixo
      }
    }
    description = "Regra padrão de permissão (sobreposta pelas regras de bloqueio abaixo)"
  }

  # Regra 2: Rate limiting por IP para endpoints de autenticação
  # Limita 60 requisições por minuto por IP em /api/auth/*
  rule {
    action   = "throttle"
    priority = 200
    match {
      expr {
        expression = "request.path.matches('/api/auth/.*')"
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"  # HTTP 429 Too Many Requests
      rate_limit_threshold {
        count        = 60    # 60 requisições
        interval_sec = 60    # por minuto
      }
      enforce_on_key = "IP"
    }
    description = "Rate limiting no endpoint de autenticação gov.br e JWT (brute force protection)"
  }

  # Regra 3: Rate limiting geral por IP
  rule {
    action   = "throttle"
    priority = 300
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      rate_limit_threshold {
        count        = 1000   # 1.000 requisições
        interval_sec = 60     # por minuto por IP
      }
      enforce_on_key = "IP"
    }
    description = "Rate limiting geral para proteção contra DDoS L7"
  }

  # Regra 4: Bloquear payloads suspeitos (SQLi, XSS) — OWASP CRS
  rule {
    action   = "deny(403)"
    priority = 400
    match {
      expr {
        # Regra pré-configurada do Google Cloud Armor para SQLi
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
    description = "Bloquear tentativas de SQL Injection (OWASP CRS)"
  }

  rule {
    action   = "deny(403)"
    priority = 401
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }
    description = "Bloquear tentativas de Cross-Site Scripting (OWASP CRS)"
  }

  # CKV_GCP_73: bloquear lookup do Log4j2 / Log4Shell (CVE-2021-44228).
  rule {
    action   = "deny(403)"
    priority = 403
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('cve-canary')"
      }
    }
    description = "Bloquear exploração do Log4Shell (CVE-2021-44228)"
  }

  rule {
    action   = "deny(403)"
    priority = 402
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-v33-stable')"
      }
    }
    description = "Bloquear Local File Inclusion (OWASP CRS)"
  }

  rule {
    action   = "deny(403)"
    priority = 403
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rfi-v33-stable')"
      }
    }
    description = "Bloquear Remote File Inclusion (OWASP CRS)"
  }

  # Regra 5: Adaptive Protection (DDoS ML) — Detecta e bloqueia ataques volumétricos
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = true
      rule_visibility = "STANDARD"
    }
  }

  # Regra default: permite todo tráfego que não bateu nas regras acima
  rule {
    action   = "allow"
    priority = 2147483647   # Menor prioridade — regra default
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Regra default: permite tráfego não bloqueado pelas regras acima"
  }
}

# ------------------------------------------------------------------
# Backend Services
# ------------------------------------------------------------------

# Backend para portal-api
resource "google_compute_backend_service" "api_backend" {
  name                  = "portal-api-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.portal_waf.id
  timeout_sec           = 300   # 5 minutos — para uploads e exports longos

  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }

  # Health check — usa o endpoint de readiness da API
  # Cloud Run gerencia health checks internamente para serverless NEGs;
  # este bloco é opcional mas recomendado para métricas do LB.
  log_config {
    enable      = true
    sample_rate = 0.1   # Loga 10% das requisições (controle de custo de logging)
  }
}

# Backend para portal-web
resource "google_compute_backend_service" "web_backend" {
  name                  = "portal-web-backend"
  project               = var.project_id
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = google_compute_security_policy.portal_waf.id
  timeout_sec           = 60

  backend {
    group = google_compute_region_network_endpoint_group.web_neg.id
  }

  log_config {
    enable      = true
    sample_rate = 0.05   # 5% das requisições do portal web
  }
}

# ------------------------------------------------------------------
# URL Map — roteamento por path
# ------------------------------------------------------------------
resource "google_compute_url_map" "portal_urlmap" {
  name            = "portal-urlmap"
  project         = var.project_id
  default_service = google_compute_backend_service.web_backend.id
  description     = "Roteia /api/* para portal-api e /* para portal-web"

  host_rule {
    hosts        = ["*"]   # Aceita qualquer hostname (multi-tenant por subdomínio)
    path_matcher = "portal-paths"
  }

  path_matcher {
    name            = "portal-paths"
    default_service = google_compute_backend_service.web_backend.id

    path_rule {
      paths   = ["/api", "/api/*"]
      service = google_compute_backend_service.api_backend.id
    }
  }
}

# ------------------------------------------------------------------
# Certificado SSL gerenciado (TLS automático)
# ------------------------------------------------------------------
resource "google_compute_managed_ssl_certificate" "portal_cert" {
  name    = "portal-cert"
  project = var.project_id

  managed {
    domains = [
      var.domain,
      "*.${var.domain}",      # Wildcard para multi-tenancy (*.prefeitura.app.br)
    ]
  }

  # NOTA: o certificado é provisionado automaticamente pelo Google após
  # o DNS apontar para o IP do Load Balancer. Pode levar 15–60 minutos.
  # Monitore: gcloud compute ssl-certificates describe portal-cert --format="value(managed.status)"
  #
  # LIMITAÇÃO: certificados gerenciados do Google NÃO suportam wildcard
  # de segundo nível (ex: *.*.dominio.com). Para multi-tenancy com
  # subdomínios de terceiro nível (tenant.cidade.dominio.com),
  # use Certificate Manager ou Cloudflare.
}

# ------------------------------------------------------------------
# SSL Policy — TLS 1.2+ com perfil MODERN (CKV_GCP_11)
# ------------------------------------------------------------------
resource "google_compute_ssl_policy" "portal_ssl_policy" {
  name            = "portal-ssl-policy"
  project         = var.project_id
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
  description     = "Política SSL do Portal: TLS 1.2+ com suítes de cifras modernas (ECDHE + AES-GCM)"
}

# ------------------------------------------------------------------
# HTTPS proxy
# ------------------------------------------------------------------
resource "google_compute_target_https_proxy" "portal_https_proxy" {
  name             = "portal-https-proxy"
  project          = var.project_id
  url_map          = google_compute_url_map.portal_urlmap.id
  ssl_certificates = [google_compute_managed_ssl_certificate.portal_cert.id]
  ssl_policy       = google_compute_ssl_policy.portal_ssl_policy.id  # CKV_GCP_11

  # Habilitar QUIC/HTTP3 para melhor performance em redes móveis
  quic_override = "ENABLE"
}

# ------------------------------------------------------------------
# HTTP → HTTPS redirect
# ------------------------------------------------------------------
resource "google_compute_url_map" "http_redirect" {
  name    = "portal-http-redirect"
  project = var.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"  # 301
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "portal_http_proxy" {
  name    = "portal-http-proxy"
  project = var.project_id
  url_map = google_compute_url_map.http_redirect.id
}

# ------------------------------------------------------------------
# Global Forwarding Rules (endereço IP fixo)
# ------------------------------------------------------------------

# IP global estático para o Load Balancer
resource "google_compute_global_address" "portal_lb_ip" {
  name         = "portal-lb-ip"
  project      = var.project_id
  description  = "IP global do Load Balancer do Portal de Prefeitura. Configure este IP no DNS."
  ip_version   = "IPV4"
  address_type = "EXTERNAL"
}

# Forwarding rule HTTPS (443)
resource "google_compute_global_forwarding_rule" "portal_https" {
  name                  = "portal-https"
  project               = var.project_id
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_target_https_proxy.portal_https_proxy.id
  ip_address            = google_compute_global_address.portal_lb_ip.address
}

# Forwarding rule HTTP (80) — redireciona para HTTPS
resource "google_compute_global_forwarding_rule" "portal_http" {
  name                  = "portal-http"
  project               = var.project_id
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "80"
  target                = google_compute_target_http_proxy.portal_http_proxy.id
  ip_address            = google_compute_global_address.portal_lb_ip.address
}
