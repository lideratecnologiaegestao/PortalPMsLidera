# PostgreSQL 16 + PostGIS 3.4 + pgvector — imagem do banco do portal.
# A imagem postgis/postgis já traz o repositório PGDG, de onde o pgvector vem.
FROM postgis/postgis:16-3.4

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*
