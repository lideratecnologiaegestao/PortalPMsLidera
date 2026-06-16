# Runbook de Backup e Restore

> Referência: bloco 3 do TR (Segurança/Firewall/WAF — "backup regular + restauração"). Cobre o ambiente de producao descrito em `docs/12-infraestrutura.md`: servidor Lidera (Windows Server 2022 / WSL2 / Docker), containers `portal-postgres`, `portal-minio`, Redis reutilizado, env em `/home/lidera/portal/portal.env`.

---

## 1. O que tem backup

| Componente | Dados críticos | Estratégia |
|---|---|---|
| `portal-postgres` (PostGIS 16) | Schema + dados de todos os tenants, RLS policies, audit_log | pg_dump diário (formato custom) + retencao rotacionada |
| MinIO bucket `portal` | Fotos, anexos, PDFs do Diário, uploads de formulários, imagens CMS | `mc mirror` diário para destino externo |
| `portal.env` | Segredos de producao (DATABASE_URL, STORAGE_*, REDIS_*, chaves de API) | Copia cifrada a cada mudanca + semanal |
| Nginx `server` blocks | Roteiro de rotas por hostname | Copia semanal |
| Cloudflare (tunnel + DNS) | Configuracao do tunel ZT, hostnames publicos | Exportavel via API Cloudflare; documentar tokens |

O que **nao** entra neste runbook: Redis (cache/filas — dados efemeros, reconstruidos automaticamente); containers do Evolution API (gerenciados pelo time de infra Lidera separadamente).

---

## 2. Script de backup diário do PostgreSQL

Salve em `/home/lidera/scripts/backup-portal-pg.sh` e torne executavel (`chmod +x`).

```bash
#!/usr/bin/env bash
# backup-portal-pg.sh — backup diário do portal-postgres
set -euo pipefail

BACKUP_DIR="/home/lidera/backups/postgres"
RETENTION_DAYS=7
RETENTION_WEEKS=4   # manter 1 por semana por 4 semanas
RETENTION_MONTHS=12 # manter 1 por mes por 12 meses
DATE=$(date +%Y%m%d)
DOW=$(date +%u)     # 1=seg … 7=dom
DOM=$(date +%d)     # dia do mes

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

DUMP_FILE="$BACKUP_DIR/daily/portal_${DATE}.dump"

# 1. Dump em formato custom (comprimido, restaurável parcialmente)
docker exec portal-postgres pg_dump \
  -U postgres \
  -d portal \
  -Fc \
  --no-acl \
  -f /tmp/portal_backup.dump

docker cp portal-postgres:/tmp/portal_backup.dump "$DUMP_FILE"
docker exec portal-postgres rm /tmp/portal_backup.dump

# 2. Dump dos roles (necessário para restore completo)
docker exec portal-postgres pg_dumpall \
  -U postgres \
  --roles-only \
  -f /tmp/portal_roles.sql

docker cp portal-postgres:/tmp/portal_roles.sql \
  "$BACKUP_DIR/daily/portal_roles_${DATE}.sql"
docker exec portal-postgres rm /tmp/portal_roles.sql

# 3. Criptografar com GPG (chave simétrica; armazenar a frase em cofre)
gpg --batch --yes --symmetric \
    --passphrase-file /home/lidera/.backup-passphrase \
    --cipher-algo AES256 \
    --output "${DUMP_FILE}.gpg" \
    "$DUMP_FILE"
rm "$DUMP_FILE"   # remover versão em claro

# 4. Promover para weekly (domingo) e monthly (dia 1)
if [ "$DOW" = "7" ]; then
  cp "${DUMP_FILE}.gpg" \
     "$BACKUP_DIR/weekly/portal_w$(date +%V_%Y).dump.gpg"
fi
if [ "$DOM" = "01" ]; then
  cp "${DUMP_FILE}.gpg" \
     "$BACKUP_DIR/monthly/portal_m$(date +%m_%Y).dump.gpg"
fi

# 5. Limpar arquivos antigos
find "$BACKUP_DIR/daily"   -name "*.gpg" -mtime +${RETENTION_DAYS}  -delete
find "$BACKUP_DIR/weekly"  -name "*.gpg" -mtime +$((RETENTION_WEEKS * 7)) -delete
find "$BACKUP_DIR/monthly" -name "*.gpg" -mtime +$((RETENTION_MONTHS * 31)) -delete

echo "Backup concluído: ${DUMP_FILE}.gpg"
```

**Agendar via cron (WSL2):**

```bash
# Editar crontab do usuario lidera
crontab -e

# Adicionar linha — executa às 02:00 todos os dias
0 2 * * * /home/lidera/scripts/backup-portal-pg.sh >> /home/lidera/logs/backup-pg.log 2>&1
```

**Retencao:**

| Tipo | Frequência | Retencao |
|---|---|---|
| Diário | Toda noite às 02:00 | 7 dias |
| Semanal | Domingo | 4 semanas |
| Mensal | Dia 1 do mês | 12 meses |

---

## 3. Script de backup do MinIO (storage)

Salve em `/home/lidera/scripts/backup-portal-minio.sh`.

```bash
#!/usr/bin/env bash
# backup-portal-minio.sh — espelha bucket portal para destino externo
set -euo pipefail

# Configurar mc com as credenciais do portal.env (carregar uma vez)
source /home/lidera/portal/portal.env

mc alias set local-portal http://localhost:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY" --quiet

# Destino externo: pode ser S3, B2, outro MinIO ou diretorio local
# Exemplo com diretorio local NAS montado via SMB/NFS:
DEST_DIR="/mnt/backup-nas/portal-minio/$(date +%Y%m%d)"
mkdir -p "$DEST_DIR"

mc mirror local-portal/portal "$DEST_DIR" \
  --overwrite \
  --remove   # remove do destino arquivos deletados na origem

echo "Mirror concluído: $DEST_DIR"
```

Para destino S3/Backblaze B2, substitua `$DEST_DIR` por `s3-alias/bucket-name` configurado no mc. Agende junto ao backup do Postgres (02:30):

```bash
30 2 * * * /home/lidera/scripts/backup-portal-minio.sh >> /home/lidera/logs/backup-minio.log 2>&1
```

---

## 4. Backup do portal.env e configurações

```bash
#!/usr/bin/env bash
# backup-portal-config.sh
set -euo pipefail

CONF_BACKUP="/home/lidera/backups/config/portal_env_$(date +%Y%m%d).gpg"
mkdir -p /home/lidera/backups/config

gpg --batch --yes --symmetric \
    --passphrase-file /home/lidera/.backup-passphrase \
    --cipher-algo AES256 \
    --output "$CONF_BACKUP" \
    /home/lidera/portal/portal.env

# Nginx — copiar blocos server do portal
cp /etc/nginx/conf.d/portal*.conf \
   /home/lidera/backups/config/ 2>/dev/null || true
cp /etc/nginx/sites-enabled/portal* \
   /home/lidera/backups/config/ 2>/dev/null || true

echo "Config backup: $CONF_BACKUP"
```

Agende semanalmente (sábado 03:00). O arquivo `.backup-passphrase` deve estar em modo `600` e a frase armazenada no cofre de senhas do municipio (ex.: Vaultwarden, Bitwarden).

---

## 5. Destino off-site

O backup local em `/home/lidera/backups/` protege contra falha de container/volume mas nao contra falha do servidor. Configure pelo menos um destino externo:

| Opção | Como |
|---|---|
| Disco externo / NAS | Monte via SMB/NFS no WSL2; use como `$DEST_DIR` |
| Backblaze B2 | `mc alias set b2 https://s3.us-west-004.backblazeb2.com KEY SECRET`; mirror para `b2/bucket` |
| AWS S3 / Wasabi | `mc alias set s3 https://s3.amazonaws.com KEY SECRET`; mirror |
| Segundo servidor | `rsync -az --delete /home/lidera/backups/ user@servidor2:/backups/portal/` |

A transferencia off-site deve ser criptografada em transito (HTTPS/TLS para S3/B2; SSH para rsync).

---

## 6. Procedimento de Restore

### 6.1 Restore do banco PostgreSQL

```bash
# Prerequisitos:
# - Container portal-postgres rodando (ou novo container postgis:16-3.4)
# - Dump descriptografado em /tmp/portal_restore.dump

# Descriptografar
gpg --batch --decrypt \
    --passphrase-file /home/lidera/.backup-passphrase \
    --output /tmp/portal_restore.dump \
    /home/lidera/backups/postgres/daily/portal_YYYYMMDD.dump.gpg

# Recriar banco (ATENÇÃO: destrói dados existentes)
docker exec portal-postgres psql -U postgres \
  -c "DROP DATABASE IF EXISTS portal;"

docker exec portal-postgres psql -U postgres \
  -c "CREATE DATABASE portal;"

# Restaurar roles primeiro
docker cp /tmp/portal_roles.sql portal-postgres:/tmp/portal_roles.sql
docker exec portal-postgres psql -U postgres -f /tmp/portal_roles.sql

# Instalar PostGIS
docker exec portal-postgres psql -U postgres portal \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Restore do dump
docker cp /tmp/portal_restore.dump portal-postgres:/tmp/portal_restore.dump
docker exec portal-postgres pg_restore \
  -U postgres \
  -d portal \
  --no-owner \
  --role=portal_app \
  -v \
  /tmp/portal_restore.dump

# Conceder permissoes ao portal_app (caso os grants não venham no dump)
docker exec portal-postgres psql -U postgres portal -c "
  GRANT USAGE ON SCHEMA public TO portal_app, portal_ro;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_app;
  GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO portal_app;
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_ro;
"

# Limpar arquivos temporários
docker exec portal-postgres rm /tmp/portal_restore.dump /tmp/portal_roles.sql
rm /tmp/portal_restore.dump
```

**Atencao critica (docs/12):** a aplicacao deve conectar como `portal_app` (NOSUPERUSER, NOBYPASSRLS). Nunca use `postgres` como `DATABASE_URL`. O superusuario ignora todas as policies de RLS — o isolamento entre prefeituras deixa de funcionar.

### 6.2 Restore do MinIO

```bash
source /home/lidera/portal/portal.env

mc alias set local-portal http://localhost:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"

# Recriar bucket se necessário
mc mb --ignore-existing local-portal/portal

# Restaurar do backup local
mc mirror /home/lidera/backups/portal-minio/YYYYMMDD/ local-portal/portal \
  --overwrite
```

### 6.3 Restore do portal.env

```bash
gpg --batch --decrypt \
    --passphrase-file /home/lidera/.backup-passphrase \
    --output /home/lidera/portal/portal.env \
    /home/lidera/backups/config/portal_env_YYYYMMDD.gpg

chmod 600 /home/lidera/portal/portal.env
```

---

## 7. Teste de Restauração (procedimento documentado)

Execute este procedimento uma vez por mês em ambiente de homologacao ou em um container paralelo. Documente o resultado na checklist mensal (secao 8).

```bash
# 1. Subir container postgres de TESTE (porta 5434 para nao conflitar)
docker run -d --name portal-postgres-test \
  -p 5434:5432 \
  -e POSTGRES_PASSWORD=test1234 \
  postgis/postgis:16-3.4

sleep 5

# 2. Descriptografar dump mais recente
gpg --batch --decrypt \
    --passphrase-file /home/lidera/.backup-passphrase \
    --output /tmp/portal_test.dump \
    $(ls -t /home/lidera/backups/postgres/daily/*.dump.gpg | head -1)

# 3. Restaurar
docker cp /tmp/portal_test.dump portal-postgres-test:/tmp/portal_test.dump
docker exec portal-postgres-test psql -U postgres \
  -c "CREATE DATABASE portal;"
docker exec portal-postgres-test psql -U postgres portal \
  -c "CREATE EXTENSION postgis;"
docker exec portal-postgres-test pg_restore \
  -U postgres -d portal --no-owner /tmp/portal_test.dump

# 4. Validar integridade
docker exec portal-postgres-test psql -U postgres portal -c "
  SELECT 'tenants' AS tabela, COUNT(*) FROM tenants
  UNION ALL
  SELECT 'manifestacoes', COUNT(*) FROM manifestacoes
  UNION ALL
  SELECT 'documentos', COUNT(*) FROM documentos
  UNION ALL
  SELECT 'usuarios', COUNT(*) FROM usuarios
  UNION ALL
  SELECT 'audit_log', COUNT(*) FROM audit_log;
"

# 5. Verificar PostGIS
docker exec portal-postgres-test psql -U postgres portal \
  -c "SELECT PostGIS_Version();"

# 6. Verificar RLS (deve retornar error se portal_app não existe ainda)
docker exec portal-postgres-test psql -U postgres portal \
  -c "\dp manifestacoes" | grep -i "Row Security"

# 7. Remover ambiente de teste
docker rm -f portal-postgres-test
rm /tmp/portal_test.dump
```

Criterio de aprovacao: as contagens batem com as registradas antes do teste, PostGIS responde versao correta, policies de RLS aparecem habilitadas.

---

## 8. RPO / RTO sugeridos

| Metrica | Valor sugerido | Justificativa |
|---|---|---|
| **RPO** (perda maxima de dados) | 24 horas | Backup diario às 02:00; dados do dia corrente estao no volume Docker ate o proximo dump |
| **RTO** (tempo de recuperacao) | 4 horas | Restore do dump + MinIO + reiniciar containers; depende do tamanho do banco |

Para RPO menor (< 1h), habilitar WAL archiving (pg_wal) com `archive_mode=on` no PostgreSQL e enviar WAL segments para storage externo — requer configuracao adicional no container (`postgresql.conf` customizado).

---

## 9. Checklist mensal de teste de restore

Execute no primeiro sabado de cada mes. Registre data, executor e resultado.

```
[ ] Descriptografar o dump mais recente com sucesso
[ ] Subir container postgres de teste
[ ] Restore concluido sem erros (pg_restore exit 0)
[ ] Contagens de tabelas batem com o esperado
[ ] PostGIS_Version() retorna versao correta
[ ] RLS habilitado nas tabelas principais
[ ] MinIO mirror validado (contagem de objetos no destino)
[ ] Tempo total de restore registrado: _____ minutos
[ ] Container de teste removido apos validacao
[ ] Resultado: [ ] APROVADO  [ ] REPROVADO — acao: _________________
[ ] Responsavel: _________________ Data: _________________
```
