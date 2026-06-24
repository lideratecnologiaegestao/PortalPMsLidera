# PostgreSQL 16 + PostGIS 3.4 + pgvector — imagem do banco do portal.
# A imagem postgis/postgis já traz o repositório PGDG, de onde o pgvector vem.
# checkov:skip=CKV_DOCKER_3:imagem postgres oficial requer usuário postgres (UID 999) para inicializar o cluster de dados; trocar para UID arbitrário quebraria a inicialização do PGDATA
FROM postgis/postgis:16-3.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD pg_isready -U postgres || exit 1
