-- Migra os documentos de transparência que ainda apontam para o placeholder
-- legado (/doc/...pdf, link 404) para o PDF-modelo servido pela API, que baixa
-- de verdade. Mantém o tenant existente (exemplolandia) genuinamente em
-- conformidade após o medidor PNTP passar a exigir URL real.
-- Executado como superusuário (bypassa RLS) — escopo pelo padrão da URL.

\echo 'ANTES:'
SELECT t.slug, d.categoria, d.url_externa
FROM transp_documentos d
JOIN tenants t ON t.id = d.tenant_id
ORDER BY t.slug, d.categoria;

UPDATE transp_documentos d
SET url_externa = 'https://'
  || COALESCE(NULLIF(t.dominio, ''), t.subdominio || '.lidera.app.br', t.slug || '.lidera.app.br')
  || '/api/transparencia/modelo/' || d.categoria || '.pdf'
FROM tenants t
WHERE t.id = d.tenant_id
  AND (d.url_externa IS NULL OR d.url_externa LIKE 'https://%/doc/%');

\echo 'DEPOIS:'
SELECT t.slug, d.categoria, d.url_externa
FROM transp_documentos d
JOIN tenants t ON t.id = d.tenant_id
ORDER BY t.slug, d.categoria;
