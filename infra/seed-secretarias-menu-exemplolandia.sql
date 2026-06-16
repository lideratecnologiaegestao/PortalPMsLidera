-- Cadastra no menu cada secretaria já existente do Exemplolândia (apontando para
-- /secretarias/<slug>), sob o grupo "Secretarias". Idempotente.
INSERT INTO menu_items (tenant_id, parent_id, local, label, tipo, href, icone, ordem, ref_tipo, ref_id)
SELECT s.tenant_id, g.id, 'cabecalho', s.nome, 'interno',
       '/secretarias/' || s.slug, 'building',
       (row_number() OVER (ORDER BY s.ordem))::int, 'secretaria', s.id
FROM secretarias s
JOIN menu_items g
  ON g.tenant_id = s.tenant_id AND g.ref_tipo = 'secretarias_root'
WHERE s.tenant_id = '7308d932-5d84-4c6b-a80d-caccc294a7c4'
  AND s.ativo = true
  AND s.slug IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM menu_items m
    WHERE m.ref_tipo = 'secretaria' AND m.ref_id = s.id
  );
