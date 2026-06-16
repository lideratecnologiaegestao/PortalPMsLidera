# apply_017_and_test.ps1
# Aplica a migration 017_home_conteudo.sql no container portal-postgres
# e executa teste de isolamento RLS com dois tenants em `noticias`.
# Executar no host Windows: .\db\apply_017_and_test.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "=== [1/5] Copiando arquivo para o container ===" -ForegroundColor Cyan
wsl docker cp /mnt/d/Site/portal-prefeitura/db/017_home_conteudo.sql portal-postgres:/017.sql
Write-Host "OK"

Write-Host "=== [2/5] Removendo CRLF e aplicando migration ===" -ForegroundColor Cyan
wsl docker exec portal-postgres sh -c "tr -d '`r' < /017.sql > /m.sql; psql -U postgres -d portal -v ON_ERROR_STOP=1 -f /m.sql"
Write-Host "OK"

Write-Host "=== [3/5] Verificando privilegios do portal_app em banners e noticias ===" -ForegroundColor Cyan
$privB = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
  "SELECT has_table_privilege('portal_app','banners','INSERT'), has_table_privilege('portal_app','banners','SELECT');"
Write-Host "banners  INSERT | SELECT => $privB"

$privN = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
  "SELECT has_table_privilege('portal_app','noticias','INSERT'), has_table_privilege('portal_app','noticias','SELECT');"
Write-Host "noticias INSERT | SELECT => $privN"

if (($privB -match 'f') -or ($privN -match 'f')) {
    Write-Host "  -> Privilegios ausentes — aplicando GRANTs explícitos..." -ForegroundColor Yellow
    wsl docker exec portal-postgres psql -U postgres -d portal -c `
      "GRANT SELECT, INSERT, UPDATE, DELETE ON banners  TO portal_app; GRANT SELECT ON banners  TO portal_ro; GRANT SELECT, INSERT, UPDATE, DELETE ON noticias TO portal_app; GRANT SELECT ON noticias TO portal_ro;"
    $privB2 = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
      "SELECT has_table_privilege('portal_app','banners','INSERT'), has_table_privilege('portal_app','banners','SELECT');"
    $privN2 = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
      "SELECT has_table_privilege('portal_app','noticias','INSERT'), has_table_privilege('portal_app','noticias','SELECT');"
    Write-Host "  Apos GRANT => banners: $privB2 | noticias: $privN2"
} else {
    Write-Host "  Privilegios OK via ALTER DEFAULT PRIVILEGES / GRANTs inline da migration."
}

Write-Host "=== [4/5] Teste de isolamento RLS em noticias (dois tenants) ===" -ForegroundColor Cyan

$rls_test = @'
BEGIN;
DO $$
DECLARE
  t1   uuid;
  t2   uuid;
  cnt1 int;
  cnt2 int;
BEGIN
  -- Tenants temporarios (postgres e superusuario — pode ver cross-tenant)
  INSERT INTO tenants(slug, nome, uf) VALUES ('_rls017_a', 'Tenant RLS 017 A', 'MT') RETURNING id INTO t1;
  INSERT INTO tenants(slug, nome, uf) VALUES ('_rls017_b', 'Tenant RLS 017 B', 'MT') RETURNING id INTO t2;

  -- Sessao Tenant A: portal_app + GUC LOCAL
  PERFORM set_config('app.current_tenant_id', t1::text, true);
  SET LOCAL ROLE portal_app;
  INSERT INTO noticias(tenant_id, slug, titulo, publicado, publicado_em)
    VALUES (t1, 'noticia-a', 'Noticia do Tenant A', true, now());

  SELECT count(*) INTO cnt1 FROM noticias WHERE publicado = true;
  ASSERT cnt1 = 1,
    'FALHOU: Tenant A deveria ver 1 noticia, viu ' || cnt1;

  -- Sessao Tenant B
  RESET ROLE;
  PERFORM set_config('app.current_tenant_id', t2::text, true);
  SET LOCAL ROLE portal_app;
  INSERT INTO noticias(tenant_id, slug, titulo, publicado, publicado_em)
    VALUES (t2, 'noticia-b', 'Noticia do Tenant B', true, now());

  SELECT count(*) INTO cnt2 FROM noticias WHERE publicado = true;
  ASSERT cnt2 = 1,
    'FALHOU: Tenant B deveria ver 1 noticia, viu ' || cnt2;

  RESET ROLE;
  RAISE NOTICE 'RLS OK — Tenant A viu % noticia(s); Tenant B viu % noticia(s). Isolamento confirmado.', cnt1, cnt2;
END;
$$;
ROLLBACK;
'@

wsl docker exec portal-postgres psql -U postgres -d portal -c $rls_test

Write-Host "=== [5/5] Estrutura final das tabelas ===" -ForegroundColor Cyan

Write-Host "--- banners ---"
wsl docker exec portal-postgres psql -U postgres -d portal -c "\d banners"

Write-Host "--- noticias ---"
wsl docker exec portal-postgres psql -U postgres -d portal -c "\d noticias"

Write-Host "--- secretarias (colunas novas) ---"
wsl docker exec portal-postgres psql -U postgres -d portal -c `
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'secretarias' AND column_name IN ('foto_url','descricao') ORDER BY column_name;"

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
