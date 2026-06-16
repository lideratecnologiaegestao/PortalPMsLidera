-- =====================================================================
-- SEED DE DEMONSTRAÇÃO (ambiente local de testes)
-- Tenant resolvido por Host: dominio 'localhost:3000' (web) e subdominio
-- 'localhost' (API direta). IA habilitada. Dados em todos os módulos.
-- Diário com hash+assinatura coerentes (requer DIARIO_SIGNING_KEY=dev-diario-key-online).
-- =====================================================================

INSERT INTO tenants (slug, nome, uf, dominio, subdominio, ativo, ia_triagem_habilitada, ia_chat_habilitada)
VALUES ('demo', 'Prefeitura de Demonstração', 'MT', 'localhost:3000', 'localhost', true, true, true)
ON CONFLICT (slug) DO UPDATE
  SET dominio = EXCLUDED.dominio, subdominio = EXCLUDED.subdominio,
      ia_triagem_habilitada = true, ia_chat_habilitada = true;

-- ---------------- CMS: home + página IPTU (para a busca/RAG) ----------------
INSERT INTO cms_pages (tenant_id, slug, titulo, publicado)
SELECT id, 'home', 'Início', true FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO cms_blocks (tenant_id, page_id, tipo, conteudo, ordem)
SELECT p.tenant_id, p.id, 'hero',
  jsonb_build_object('titulo', 'Bem-vindo à Prefeitura de Demonstração',
                     'subtitulo', 'Serviços, transparência e ouvidoria em um só lugar',
                     'cta', jsonb_build_object('label', 'Transparência', 'href', '/transparencia')), 0
FROM cms_pages p JOIN tenants t ON t.id = p.tenant_id
WHERE t.slug = 'demo' AND p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM cms_blocks b WHERE b.page_id = p.id);

INSERT INTO cms_pages (tenant_id, slug, titulo, publicado)
SELECT id, 'iptu', 'IPTU - Segunda via', true FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO cms_blocks (tenant_id, page_id, tipo, conteudo)
SELECT p.tenant_id, p.id, 'texto',
  jsonb_build_object('corpo', 'Para emitir a segunda via do IPTU acesse o portal de serviços da prefeitura e informe a inscrição imobiliária.')
FROM cms_pages p JOIN tenants t ON t.id = p.tenant_id
WHERE t.slug = 'demo' AND p.slug = 'iptu'
  AND NOT EXISTS (SELECT 1 FROM cms_blocks b WHERE b.page_id = p.id);

-- ---------------- Transparência ----------------
INSERT INTO transp_despesas (tenant_id, exercicio, empenho, orgao, credor_nome, credor_doc, valor_empenhado, valor_liquidado, valor_pago, data_empenho)
SELECT id, 2026, '2026NE000123', 'Secretaria de Obras', 'Construtora Alpha LTDA', '11222333000181', 150000, 120000, 100000, '2026-03-15' FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, exercicio, empenho) DO NOTHING;
INSERT INTO transp_despesas (tenant_id, exercicio, empenho, orgao, credor_nome, credor_doc, valor_empenhado, valor_pago, data_empenho)
SELECT id, 2026, '2026NE000124', 'Secretaria de Saúde', 'João da Silva ME', '12345678909', 50000, 50000, '2026-04-01' FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, exercicio, empenho) DO NOTHING;

INSERT INTO transp_receitas (tenant_id, exercicio, codigo, descricao, categoria, valor_previsto, valor_arrecadado, data_lancamento)
SELECT id, 2026, '1112.04.31', 'IPTU', 'corrente', 2000000, 1500000, '2026-01-31' FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, exercicio, codigo, data_lancamento) DO NOTHING;

INSERT INTO transp_folha (tenant_id, exercicio, mes, matricula, nome_servidor, cargo, vinculo, orgao, remuneracao_bruta, descontos, remuneracao_liquida)
SELECT id, 2026, 5, '00012345', 'Maria de Souza', 'Médica', 'efetivo', 'Saúde', 18000, 4000, 14000 FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, exercicio, mes, matricula) DO NOTHING;

INSERT INTO transp_sync_log (tenant_id, dataset, origem, registros, status)
SELECT id, d, 'seed', 1, 'ok' FROM tenants CROSS JOIN (VALUES ('despesas'), ('receitas'), ('folha')) AS x(d) WHERE slug = 'demo';

-- ---------------- Diário Oficial (publicado, hash+assinatura coerentes) ----------------
-- Ordem por causa do trigger de imutabilidade: insere rascunho → hash → assina → publica.
INSERT INTO diario_edicoes (tenant_id, numero, data_edicao, titulo, conteudo)
SELECT id, '2026-001', '2026-06-01', 'Edição nº 1 — Atos Oficiais',
  'Decreto nº 1: Fica instituído o Programa de Demonstração do município.' FROM tenants WHERE slug = 'demo'
ON CONFLICT (tenant_id, numero) DO NOTHING;

UPDATE diario_edicoes d SET
  hash = encode(digest(d.numero || E'\n' || to_char(d.data_edicao, 'YYYY-MM-DD') || E'\n' || d.titulo || E'\n' || d.conteudo, 'sha256'), 'hex'),
  carimbo_tempo = now()
WHERE d.numero = '2026-001' AND d.status = 'rascunho'
  AND d.tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

UPDATE diario_edicoes d SET
  assinatura = encode(hmac(d.hash, 'dev-diario-key-online', 'sha256'), 'hex'),
  algoritmo = 'HMAC-SHA256 (DEV)'
WHERE d.numero = '2026-001' AND d.status = 'rascunho'
  AND d.tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

UPDATE diario_edicoes d SET status = 'publicado', publicado_em = now()
WHERE d.numero = '2026-001' AND d.status = 'rascunho'
  AND d.tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');
