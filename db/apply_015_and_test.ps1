# apply_015_and_test.ps1
# Aplica a migration 015_servicos.sql no container portal-postgres
# e executa teste de isolamento RLS com dois tenants.
# Executar no host Windows: .\db\apply_015_and_test.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "=== [1/5] Copiando arquivo para o container ===" -ForegroundColor Cyan
wsl docker cp /mnt/d/Site/portal-prefeitura/db/015_servicos.sql portal-postgres:/015_servicos.sql
Write-Host "OK"

Write-Host "=== [2/5] Removendo CRLF e aplicando migration ===" -ForegroundColor Cyan
wsl docker exec portal-postgres sh -c "tr -d '`r' < /015_servicos.sql > /015_servicos_lf.sql; psql -U postgres -d portal -v ON_ERROR_STOP=1 -f /015_servicos_lf.sql"
Write-Host "OK"

Write-Host "=== [3/5] Verificando privilegios do portal_app ===" -ForegroundColor Cyan
$priv = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
  "SELECT has_table_privilege('portal_app','servicos','INSERT'), has_table_privilege('portal_app','servicos','SELECT');"
Write-Host "INSERT | SELECT => $priv"

if ($priv -match 'f') {
    Write-Host "  -> Privilegios ausentes — aplicando GRANTs explícitos..." -ForegroundColor Yellow
    wsl docker exec portal-postgres psql -U postgres -d portal -c `
      "GRANT SELECT, INSERT, UPDATE, DELETE ON servicos TO portal_app; GRANT SELECT ON servicos TO portal_ro;"
    $priv2 = wsl docker exec portal-postgres psql -U postgres -d portal -tAc `
      "SELECT has_table_privilege('portal_app','servicos','INSERT'), has_table_privilege('portal_app','servicos','SELECT');"
    Write-Host "  Apos GRANT: INSERT | SELECT => $priv2"
} else {
    Write-Host "  Privilegios OK via ALTER DEFAULT PRIVILEGES (sem necessidade de GRANT manual)."
}

Write-Host "=== [4/5] Teste de isolamento RLS (dois tenants) ===" -ForegroundColor Cyan

# Bloco SQL auto-contido:
#   - Cria dois tenants de teste temporários
#   - Insere um serviço em cada um usando SET ROLE portal_app + set_config
#   - Verifica que cada sessão só enxerga o próprio serviço
#   - Limpa tudo ao final (ROLLBACK)
$rls_test = @'
DO $$
DECLARE
  t1 uuid;
  t2 uuid;
  cnt1 int;
  cnt2 int;
BEGIN
  -- Tenants temporarios (roles de plataforma podem ver cross-tenant)
  INSERT INTO tenants(slug, nome, uf) VALUES ('_rls_test_a', 'Tenant RLS A', 'MT') RETURNING id INTO t1;
  INSERT INTO tenants(slug, nome, uf) VALUES ('_rls_test_b', 'Tenant RLS B', 'MT') RETURNING id INTO t2;

  -- Sessao Tenant A (simula portal_app com SET ROLE + set_config LOCAL)
  PERFORM set_config('app.current_tenant_id', t1::text, true);
  SET LOCAL ROLE portal_app;
  INSERT INTO servicos(tenant_id, titulo, slug, publicado)
    VALUES (t1, 'Servico A', 'servico-a', true);

  -- Verificar que Tenant A so ve o proprio registro
  SELECT count(*) INTO cnt1 FROM servicos WHERE publicado = true;
  ASSERT cnt1 = 1, 'FALHOU: Tenant A deveria ver exatamente 1 servico, viu ' || cnt1;

  -- Sessao Tenant B
  RESET ROLE;
  PERFORM set_config('app.current_tenant_id', t2::text, true);
  SET LOCAL ROLE portal_app;
  INSERT INTO servicos(tenant_id, titulo, slug, publicado)
    VALUES (t2, 'Servico B', 'servico-b', true);

  -- Verificar que Tenant B so ve o proprio registro (nao ve o de A)
  SELECT count(*) INTO cnt2 FROM servicos WHERE publicado = true;
  ASSERT cnt2 = 1, 'FALHOU: Tenant B deveria ver exatamente 1 servico, viu ' || cnt2;

  RESET ROLE;
  RAISE NOTICE 'RLS OK — Tenant A viu % servico(s); Tenant B viu % servico(s). Isolamento confirmado.', cnt1, cnt2;
END;
$$;
ROLLBACK;
'@

wsl docker exec portal-postgres psql -U postgres -d portal -c "BEGIN; $rls_test"

Write-Host "=== [5/5] Verificando estrutura final da tabela ===" -ForegroundColor Cyan
wsl docker exec portal-postgres psql -U postgres -d portal -c `
  "\d servicos"

Write-Host ""
Write-Host "=== CONCLUIDO ===" -ForegroundColor Green
