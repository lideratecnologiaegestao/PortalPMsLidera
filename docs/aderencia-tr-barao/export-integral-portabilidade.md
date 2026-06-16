# Export Integral e Portabilidade ao Fim do Contrato

> Referência: bloco 15 do TR (Requisitos Técnicos Mínimos — portabilidade/export). LGPD art. 18, VI (portabilidade do titular) e art. 40 (interoperabilidade). LAI 12.527/2011 para acervos de transparência.

---

## 1. O que é exportável hoje — por módulo

| Conjunto de dados | Formatos disponíveis | Como obter |
|---|---|---|
| Manifestações (Ouvidoria/e-SIC) | CSV, XLSX, PDF, DOC | `GET /api/admin/manifestacoes/relatorio?formato=csv|xlsx|pdf|doc` |
| Documentos cadastrados (SIC) | CSV, JSON | `GET /api/admin/documentos/export?formato=csv|json` |
| Dados abertos — Transparência | CSV, JSON | `GET /api/transparencia/dados-abertos` (endpoint público) |
| Formulários — envios | CSV, XML, XLSX | `GET /api/admin/formularios/:id/envios/export?formato=csv|xml|xlsx` |
| Dados do titular (LGPD) | JSON estruturado | `GET /api/lgpd/meus-dados` (autenticado como cidadão) |
| Serviços / Carta de Serviços | JSON | `GET /api/admin/servicos/export` (recomendado adicionar; ver fase futura) |
| Usuários e grupos admin | CSV / JSON | `GET /api/admin/users/relatorio?formato=csv` |
| Relatórios consolidados da Ouvidoria (gráficos) | CSV, XLSX, PDF, DOC | `GET /api/admin/manifestacoes/relatorio/consolidado` |
| Conformidade LGPD | JSON / PDF | `GET /api/lgpd/admin/conformidade` |
| Páginas CMS (snapshots) | JSON (snapshot) | `GET /api/admin/pages/:id/snapshots` |
| Notícias, secretarias, banners | — | Exportados via dump completo do banco (ver seção 2) |
| Arquivos e anexos (PDFs, imagens, vídeos) | Binário original | `mc mirror` do bucket MinIO `portal` (ver seção 2) |

Os exports por módulo cobrem os conjuntos de dados estruturados acessíveis pelo painel. O **export integral** para encerramento de contrato requer, adicionalmente, o dump completo do banco e a cópia do storage.

---

## 2. Procedimento de Export Integral

O export integral é composto de três partes: banco de dados, storage de mídia e configurações de ambiente. Execute como operador com acesso ao servidor Lidera (WSL2/Ubuntu).

### 2.1 Dump do banco PostgreSQL (portal-postgres/PostGIS)

O container `portal-postgres` usa `postgis/postgis:16-3.4`. O dump deve ser executado como superusuário do banco (apenas para o dump — nunca para a operação da aplicação).

```bash
# Substitua <senha_postgres> pela senha do superusuário do portal-postgres
# O formato custom (-Fc) preserva tipos PostGIS e permite restore seletivo

DUMP_DIR="/home/lidera/backup-export-$(date +%Y%m%d)"
mkdir -p "$DUMP_DIR"

docker exec portal-postgres pg_dump \
  -U postgres \
  -d portal \
  -Fc \
  --no-acl \
  -f /tmp/portal_dump_$(date +%Y%m%d).dump

docker cp portal-postgres:/tmp/portal_dump_$(date +%Y%m%d).dump \
  "$DUMP_DIR/portal_dump_$(date +%Y%m%d).dump"
```

**Observacao sobre RLS e roles:** o dump inclui as definicoes de policies de RLS e os roles `portal_app` e `portal_ro`. Ao reimportar em outro provedor, o operador deve:
1. Criar os roles antes do restore (`CREATE ROLE portal_app LOGIN ...`).
2. Instalar a extensao PostGIS no banco destino (`CREATE EXTENSION postgis;`).
3. Executar o restore (ver secao 3).

O superusuario `postgres` e usado **somente** para o dump. A aplicacao continua conectando como `portal_app`.

Para incluir DDL de roles de forma portavel, exporte separadamente:

```bash
docker exec portal-postgres pg_dumpall \
  -U postgres \
  --roles-only \
  -f /tmp/portal_roles.sql

docker cp portal-postgres:/tmp/portal_roles.sql \
  "$DUMP_DIR/portal_roles.sql"
```

### 2.2 Export do storage de mídia (MinIO — bucket `portal`)

O MinIO Client (`mc`) já esta disponivel ou pode ser instalado em segundos:

```bash
# Instalar mc no WSL2 (se ausente)
curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# Configurar alias para o portal-minio (substitua credenciais de portal.env)
mc alias set portal-minio http://localhost:9000 \
  $STORAGE_ACCESS_KEY $STORAGE_SECRET_KEY

# Espelhar todo o bucket para o diretório de export
mc mirror portal-minio/portal "$DUMP_DIR/storage/"
```

Alternativamente com `rclone` (util para destino em S3/B2/GCS externo):

```bash
# Configurar rclone com endpoint MinIO e credenciais
rclone copy :s3,provider=Minio,endpoint=http://localhost:9000,\
access_key_id=$STORAGE_ACCESS_KEY,\
secret_access_key=$STORAGE_SECRET_KEY:portal \
  "$DUMP_DIR/storage/"
```

O bucket `portal` contem: fotos de chamados, anexos de manifestacoes, imagens de noticias/galerias, PDFs do Diario Oficial, uploads de formularios e imagens do CMS.

### 2.3 Export de configuracoes e segredos

```bash
# Copiar o arquivo de variaveis de ambiente (contém segredos — criptografar antes de transmitir)
cp /home/lidera/portal/portal.env "$DUMP_DIR/portal.env.bak"

# Criptografar com GPG ou age antes de transferir
gpg --symmetric --cipher-algo AES256 "$DUMP_DIR/portal.env.bak"
rm "$DUMP_DIR/portal.env.bak"   # remover versao em claro após cifrar
```

Inclua tambem: configuracao do Nginx (blocos `server` do portal), IDs/tokens do tunel Cloudflare Zero Trust e quaisquer chaves de integracao (OIDC gov.br, Evolution API, Anthropic).

### 2.4 Compactacao e checksum do pacote final

```bash
tar -czf "$DUMP_DIR.tar.gz" -C "$(dirname $DUMP_DIR)" "$(basename $DUMP_DIR)"
sha256sum "$DUMP_DIR.tar.gz" > "$DUMP_DIR.tar.gz.sha256"
```

---

## 3. Formato de entrega ao município

| Artefato | Formato | Conteúdo |
|---|---|---|
| `portal_dump_YYYYMMDD.dump` | pg_dump custom (-Fc) | Schema + dados + RLS policies + PostGIS |
| `portal_roles.sql` | SQL puro | Definicao dos roles `portal_app` / `portal_ro` |
| `storage/` | Árvore de diretórios | Todos os arquivos do bucket MinIO por prefixo |
| `portal.env.bak.gpg` | Cifrado GPG/age | Variaveis de ambiente e segredos |
| `dicionario-dados.md` | Markdown | Descricao de cada tabela, campos-chave e relacoes (ver nota abaixo) |
| `LEIAME-restore.md` | Markdown | Instrucoes de reimportacao (esta secao 3 + secao 4) |

O **dicionario de dados** deve ser extraido do schema Prisma (`api/prisma/schema.prisma`) e das migrations SQL em `db/*.sql`. A responsabilidade de mante-lo atualizado e do fornecedor durante o contrato; a entrega inclui a versao vigente na data de encerramento.

**Prazo sugerido:** o fornecedor disponibiliza o pacote de export integral em ate **15 dias uteis** apos o aviso de encerramento contratual. O municipio tem **30 dias** para confirmar a integridade antes da eliminacao dos dados (ver secao 6).

---

## 4. Reimportacao em outro provedor

O municipio pode operar o sistema autonomamente em qualquer VPS/cloud que suporte Docker e PostgreSQL 16 + PostGIS.

### 4.1 Pre-requisitos no ambiente destino

- Docker + Docker Compose
- Postgres 16 com extensao PostGIS 3.4 (`postgis/postgis:16-3.4`)
- MinIO ou qualquer storage S3-compativel
- Redis 7
- Node.js 20+ (para o portal-api e portal-web, se recompilar)

### 4.2 Restaurar o banco

```bash
# 1. Criar o banco e os roles no destino
psql -U postgres -h <host-destino> \
  -c "CREATE DATABASE portal;"

psql -U postgres -h <host-destino> portal \
  -f portal_roles.sql

# 2. Instalar PostGIS (se nao vier no container)
psql -U postgres -h <host-destino> portal \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 3. Restaurar o dump
pg_restore -U postgres -h <host-destino> -d portal \
  --no-owner --role=portal_app \
  portal_dump_YYYYMMDD.dump

# 4. Conceder permissoes ao papel de aplicacao
psql -U postgres -h <host-destino> portal \
  -c "GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;"
```

### 4.3 Restaurar o storage

```bash
mc alias set destino http://<host-minio-destino>:9000 \
  <novo-access-key> <novo-secret-key>

mc mb destino/portal
mc mirror storage/ destino/portal
```

### 4.4 Atualizar variaveis de ambiente

Editar `portal.env` com as novas credenciais (`DATABASE_URL`, `STORAGE_*`, `REDIS_*`), subir os containers do portal.

### 4.5 Validacao pos-restore

Apos o restore, verificar:
- Login no painel admin (`/admin`).
- Listagem de manifestacoes — confirmar total bate com o pre-export.
- Acesso a um PDF do Diario Oficial armazenado no MinIO.
- RLS: logar como `portal_app` e confirmar que `SELECT * FROM tenants` retorna apenas o tenant esperado.

---

## 5. Acesso sem o fornecedor (autonomia técnica)

O codigo-fonte do portal (NestJS + Next.js) e entregue com a documentacao do repositorio. O municipio pode:
- Subir a stack via `docker compose up -d` usando o `docker-compose.yml` do repo.
- Compilar a API (`cd api && npm run build`) e o portal (`cd web && npm run build`).
- Aplicar migrations futuras com `psql "$DATABASE_URL" -f db/<migration>.sql`.

---

## 6. Eliminação segura dos dados após a transição (LGPD)

Apos confirmacao pelo municipio da integridade do export (ou expirado o prazo de 30 dias sem manifestacao), o fornecedor executa:

```bash
# Remover volumes Docker (dados do banco e storage)
docker volume rm portal_pg_data portal_minio_data

# Confirmar remocao
docker volume ls | grep portal
```

Alem disso:
- Excluir `portal.env` e qualquer copia de segredo nos sistemas do fornecedor.
- Revogar tokens de integracao (OIDC gov.br, Evolution, Anthropic) ligados ao tenant.
- Registrar o evento de eliminacao no `audit_log` antes do descomissionamento (ou em documento assinado pelo fornecedor se o banco ja estiver inacessivel).
- Emitir **Declaracao de Eliminacao** assinada digitalmente, conforme art. 16 LGPD, com: identificacao do contratante, descricao dos dados eliminados, data, metodo (exclusao de volume Docker + revogacao de credenciais) e responsavel tecnico.

Dados sob **guarda legal obrigatoria** (manifestacoes do e-SIC: 5 anos; Diario Oficial: permanente) devem ser entregues ao municipio antes da eliminacao e retidos pelo municipio no novo ambiente.

---

## 7. Tabela-resumo: conjunto de dados → formato → como obter

| Conjunto | Formato primário | Endpoint/comando | Observacao |
|---|---|---|---|
| Manifestacoes Ouvidoria/e-SIC | CSV / XLSX / PDF / DOC | `GET /api/admin/manifestacoes/relatorio` | Inclui historico e satisfacao |
| Documentos SIC | CSV / JSON | `GET /api/admin/documentos/export` | Metadados; arquivos no storage |
| Transparencia dados-abertos | CSV / JSON | `GET /api/transparencia/dados-abertos` | Endpoint publico |
| Formularios — envios | CSV / XML / XLSX | `GET /api/admin/formularios/:id/envios/export` | Por formulario |
| Dados do titular (LGPD) | JSON | `GET /api/lgpd/meus-dados` | Autenticado como cidadao |
| Banco completo (schema + dados) | pg_dump custom | `docker exec portal-postgres pg_dump ...` | Inclui RLS, PostGIS |
| Roles do banco | SQL | `pg_dumpall --roles-only` | Necessario para restore |
| Arquivos/midia/anexos | Binario original | `mc mirror portal-minio/portal ./storage/` | Estrutura de prefixos MinIO |
| Configuracoes e segredos | Cifrado GPG/age | `cp portal.env + gpg --symmetric` | Rotacionar apos entrega |
| Paginas CMS (snapshots) | JSON | `GET /api/admin/pages/:id/snapshots` | Versoes historicas incluidas |
| Usuarios e grupos admin | CSV / JSON | `GET /api/admin/users/relatorio` | |
| Incidentes LGPD | JSON / PDF | `GET /api/lgpd/admin/conformidade` | Exigido para conformidade |
