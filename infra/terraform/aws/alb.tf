# alb.tf — Application Load Balancer e WAFv2 do Portal de Prefeitura
#
# Roteamento:
#   - http://*            → redirect 301 para https
#   - https://api.<domain>/* → target group API (porta 3001)
#   - https://*.domain    → target group Web (porta 3000) — wildcard multi-tenant
#   - Default              → target group Web

# ---------------------------------------------------------------------------
# Application Load Balancer (público, subnets públicas)
# ---------------------------------------------------------------------------

resource "aws_lb" "portal" {
  #checkov:skip=CKV2_AWS_76:WAF associado via aws_wafv2_web_acl_association quando var.enable_waf=true; o graph do checkov não resolve a associação indexada por count
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = true
  drop_invalid_header_fields = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = {
    Name = "${var.project_name}-alb"
  }
}

# ---------------------------------------------------------------------------
# Target Group — API NestJS (porta 3001)
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "api" {
  #checkov:skip=CKV_AWS_378:TLS termina no ALB; o tráfego ALB→container (ECS Fargate, awsvpc) é HTTP interno na VPC privada
  name        = "${var.project_name}-tg-api"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.portal.id
  target_type = "ip" # necessário para ECS Fargate com awsvpc network mode

  health_check {
    enabled             = true
    path                = "/api/health/ready"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200" # espera HTTP 200 no health check
  }

  # Timeout de draining — tempo para finalizar conexões antes de remover instância
  deregistration_delay = 30

  tags = {
    Name      = "${var.project_name}-tg-api"
    Componente = "api"
  }
}

# ---------------------------------------------------------------------------
# Target Group — Web Next.js (porta 3000)
# ---------------------------------------------------------------------------

resource "aws_lb_target_group" "web" {
  name        = "${var.project_name}-tg-web"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.portal.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200-299" # Next.js pode retornar 200 ou 307
  }

  deregistration_delay = 30

  tags = {
    Name      = "${var.project_name}-tg-web"
    Componente = "web"
  }
}

# ---------------------------------------------------------------------------
# Listener HTTP — redireciona todo tráfego para HTTPS
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.portal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "${var.project_name}-listener-http"
  }
}

# ---------------------------------------------------------------------------
# Listener HTTPS — roteamento principal
# ---------------------------------------------------------------------------

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.portal.arn
  port              = 443
  protocol          = "HTTPS"

  # Política TLS moderna — TLS 1.2+ com suporte a TLS 1.3
  ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn = var.acm_certificate_arn

  # Ação padrão: encaminhar para o Web Next.js
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  tags = {
    Name = "${var.project_name}-listener-https"
  }
}

# ---------------------------------------------------------------------------
# Regra de roteamento: api.<domain> → API NestJS
# Rota host-based: todo tráfego para api.DOMINIO vai para o target group da API
# ---------------------------------------------------------------------------

resource "aws_lb_listener_rule" "api_host" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = ["api.${var.domain}"]
    }
  }

  tags = {
    Name = "${var.project_name}-rule-api-host"
  }
}

# ---------------------------------------------------------------------------
# Regra de roteamento: /api/* → API NestJS (fallback para path-based)
# Útil quando o frontend Next.js e a API compartilham o mesmo domínio raiz
# ---------------------------------------------------------------------------

resource "aws_lb_listener_rule" "api_path" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  tags = {
    Name = "${var.project_name}-rule-api-path"
  }
}

# ---------------------------------------------------------------------------
# WAF v2 — proteção contra ataques comuns (OWASP Top 10)
# Criado somente se var.enable_waf = true
# ---------------------------------------------------------------------------

resource "aws_wafv2_web_acl" "portal" {
  #checkov:skip=CKV2_AWS_31:logging definido em aws_wafv2_web_acl_logging_configuration (condicional a var.enable_waf); o graph do checkov não resolve a referência indexada por count
  count = var.enable_waf ? 1 : 0

  name  = "${var.project_name}-waf"
  scope = "REGIONAL" # REGIONAL para ALB; CLOUDFRONT para distribuições CloudFront

  default_action {
    allow {}
  }

  # Regra 1: Proteção contra ataques comuns (SQL Injection, XSS, etc.)
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {} # usar a ação padrão das regras gerenciadas (block)
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-common-rules"
      sampled_requests_enabled   = true
    }
  }

  # Regra 2: Proteção contra ataques conhecidos de bots maliciosos
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # Regra 3: Rate limiting — máximo 2000 requisições por 5 minutos por IP
  # Ajuste conforme o tráfego esperado do portal
  rule {
    name     = "RateLimitPorIP"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.project_name}-waf"
  }
}

# Associa o WAF ao ALB
resource "aws_wafv2_web_acl_association" "portal" {
  count = var.enable_waf ? 1 : 0

  resource_arn = aws_lb.portal.arn
  web_acl_arn  = aws_wafv2_web_acl.portal[0].arn
}

# Log group e configuração de logging do WAF (CKV2_AWS_31).
resource "aws_cloudwatch_log_group" "waf" {
  count = var.enable_waf ? 1 : 0

  name              = "aws-waf-logs-${var.project_name}"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.portal.arn

  tags = {
    Name = "${var.project_name}-waf-logs"
  }
}

resource "aws_wafv2_web_acl_logging_configuration" "portal" {
  count = var.enable_waf ? 1 : 0

  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]
  resource_arn            = aws_wafv2_web_acl.portal[0].arn
}
