# network.tf — VPC, subnets, gateways e security groups do Portal de Prefeitura

locals {
  # Mapeamento AZ → índice para criação de subnets via count
  az_count = length(var.availability_zones)

  # Prefixo de nome padronizado para todos os recursos de rede
  name_prefix = var.project_name
}

# ---------------------------------------------------------------------------
# VPC principal
# ---------------------------------------------------------------------------

resource "aws_vpc" "portal" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# ---------------------------------------------------------------------------
# Subnets públicas (ALB, NAT Gateway)
# Uma por Zona de Disponibilidade
# ---------------------------------------------------------------------------

resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.portal.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.name_prefix}-public-${var.availability_zones[count.index]}"
    Tipo = "publica"
  }
}

# ---------------------------------------------------------------------------
# Subnets privadas (ECS Fargate, RDS, ElastiCache)
# Uma por Zona de Disponibilidade
# ---------------------------------------------------------------------------

resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.portal.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name = "${local.name_prefix}-private-${var.availability_zones[count.index]}"
    Tipo = "privada"
  }
}

# ---------------------------------------------------------------------------
# Internet Gateway — acesso à internet das subnets públicas
# ---------------------------------------------------------------------------

resource "aws_internet_gateway" "portal" {
  vpc_id = aws_vpc.portal.id

  tags = {
    Name = "${local.name_prefix}-igw"
  }
}

# ---------------------------------------------------------------------------
# NAT Gateway — permite que subnets privadas acessem a internet (saída)
# Single NAT para reduzir custo; em produção com alta disponibilidade,
# crie um NAT Gateway por AZ e uma route table privada por AZ.
# ---------------------------------------------------------------------------

resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${local.name_prefix}-nat-eip"
  }

  depends_on = [aws_internet_gateway.portal]
}

resource "aws_nat_gateway" "portal" {
  # Implantado na primeira subnet pública — para alta disponibilidade em produção,
  # crie um NAT Gateway por AZ (aws_nat_gateway com count = local.az_count)
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${local.name_prefix}-nat-gw"
  }

  depends_on = [aws_internet_gateway.portal]
}

# ---------------------------------------------------------------------------
# Route Tables
# ---------------------------------------------------------------------------

# Tabela de rotas pública: 0.0.0.0/0 → Internet Gateway
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.portal.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.portal.id
  }

  tags = {
    Name = "${local.name_prefix}-rt-public"
  }
}

# Tabela de rotas privada: 0.0.0.0/0 → NAT Gateway (saída para internet sem exposição pública)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.portal.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.portal.id
  }

  tags = {
    Name = "${local.name_prefix}-rt-private"
  }
}

# Associações das subnets públicas à route table pública
resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Associações das subnets privadas à route table privada
resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ---------------------------------------------------------------------------
# Security Groups
# ---------------------------------------------------------------------------

# SG do ALB — aceita tráfego HTTP/HTTPS da internet (IPv4 e IPv6)
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-sg-alb"
  description = "Security group do Application Load Balancer — permite HTTP/HTTPS da internet"
  vpc_id      = aws_vpc.portal.id

  # Tráfego HTTP de entrada (redirecionado para HTTPS)
  ingress {
    description      = "HTTP da internet (IPv4)"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # Tráfego HTTPS de entrada
  ingress {
    description      = "HTTPS da internet (IPv4 e IPv6)"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # Saída irrestrita — necessária para health checks e encaminhamento de requisições
  egress {
    description = "Saída irrestrita do ALB"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-alb"
  }
}

# SG dos contêineres ECS — aceita tráfego somente do ALB
# Saída irrestrita para acessar RDS, Redis, S3 (via endpoint) e Secrets Manager
resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-sg-ecs"
  description = "Security group dos contêineres ECS Fargate — aceita tráfego somente do ALB"
  vpc_id      = aws_vpc.portal.id

  # Porta da API NestJS — somente do ALB
  ingress {
    description     = "Porta da API NestJS (3001) somente do ALB"
    from_port       = 3001
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Porta do Web Next.js — somente do ALB
  ingress {
    description     = "Porta do Web Next.js (3000) somente do ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Saída irrestrita — permite acessar RDS (5432), Redis (6379), S3 (443), Secrets Manager (443)
  egress {
    description = "Saída irrestrita dos contêineres ECS"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-ecs"
  }
}

# SG do RDS — aceita conexões PostgreSQL somente dos contêineres ECS
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-sg-rds"
  description = "Security group do RDS PostgreSQL — aceita conexões somente do ECS"
  vpc_id      = aws_vpc.portal.id

  ingress {
    description     = "PostgreSQL (5432) somente dos contêineres ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "Saída irrestrita do RDS (replicação, backups)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-rds"
  }
}

# SG do ElastiCache Redis — aceita conexões somente dos contêineres ECS
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-sg-redis"
  description = "Security group do ElastiCache Redis — aceita conexões somente do ECS"
  vpc_id      = aws_vpc.portal.id

  ingress {
    description     = "Redis (6379) somente dos contêineres ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    description = "Saída irrestrita do Redis"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-sg-redis"
  }
}
