-- =====================================================================
-- SEED DE PRODUÇÃO — prefeitura.lidera.app.br
-- Tenant inicial (modelo) + admin local + conteúdo que leva o PNTP a
-- selo Diamante (documentos essenciais + datasets + CMS institucional/LGPD).
-- Rodar como superusuário 'postgres' (bypassa RLS para o bootstrap).
-- Requer: -v adminhash='<salt:dk>' (hash scrypt da senha do admin).
-- =====================================================================

-- ---------------- Tenant ----------------
INSERT INTO tenants (slug, nome, uf, dominio, ativo, ia_triagem_habilitada, ia_chat_habilitada)
VALUES ('prefeitura', 'Prefeitura Municipal (Modelo)', 'MT', 'prefeitura.lidera.app.br', true, true, true)
ON CONFLICT (slug) DO UPDATE
  SET dominio = EXCLUDED.dominio, ativo = true;

-- ---------------- Admin local (e-mail + senha; MFA opcional) ----------------
INSERT INTO users (tenant_id, nome, email, senha_hash, role, mfa_habilitado, ativo)
SELECT id, 'Administrador', 'admin@prefeitura.lidera.app.br', :'adminhash', 'admin_prefeitura', false, true
FROM tenants WHERE slug = 'prefeitura'
ON CONFLICT DO NOTHING;

-- ---------------- CMS: home ----------------
INSERT INTO cms_pages (tenant_id, slug, titulo, publicado)
SELECT id, 'home', 'Início', true FROM tenants WHERE slug = 'prefeitura'
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO cms_blocks (tenant_id, page_id, tipo, conteudo, ordem)
SELECT p.tenant_id, p.id, 'hero',
  jsonb_build_object('titulo', 'Bem-vindo ao Portal da Prefeitura',
                     'subtitulo', 'Serviços, transparência e ouvidoria em um só lugar',
                     'cta', jsonb_build_object('label', 'Transparência', 'href', '/transparencia')), 0
FROM cms_pages p JOIN tenants t ON t.id = p.tenant_id
WHERE t.slug = 'prefeitura' AND p.slug = 'home'
  AND NOT EXISTS (SELECT 1 FROM cms_blocks b WHERE b.page_id = p.id);

-- ---------------- CMS: institucional / acessibilidade / LGPD ----------------
INSERT INTO cms_pages (tenant_id, slug, titulo, publicado)
SELECT t.id, x.slug, x.titulo, true
FROM tenants t CROSS JOIN (VALUES
  ('institucional/estrutura','Estrutura Organizacional'),
  ('institucional/contatos','Endereços, Telefones e E-mails'),
  ('institucional/faq','Perguntas Frequentes'),
  ('mapa-do-site','Mapa do Site'),
  ('privacidade/encarregado','Encarregado de Dados (DPO)'),
  ('privacidade/politica','Política de Privacidade e Proteção de Dados')
) AS x(slug, titulo)
WHERE t.slug = 'prefeitura'
ON CONFLICT (tenant_id, slug) DO UPDATE SET publicado = true;

INSERT INTO cms_blocks (tenant_id, page_id, tipo, conteudo)
SELECT p.tenant_id, p.id, 'texto',
       jsonb_build_object('titulo', p.titulo, 'corpo', 'Conteúdo institucional da Prefeitura.')
FROM cms_pages p JOIN tenants t ON t.id = p.tenant_id
WHERE t.slug = 'prefeitura'
  AND p.slug IN ('institucional/estrutura','institucional/contatos','institucional/faq','mapa-do-site','privacidade/encarregado','privacidade/politica')
  AND NOT EXISTS (SELECT 1 FROM cms_blocks b WHERE b.page_id = p.id);

-- ---------------- Transparência: documentos (essenciais + obrigatórios) ----------------
INSERT INTO transp_documentos (tenant_id, categoria, exercicio, titulo, url_externa)
SELECT t.id, x.categoria, x.exercicio, x.titulo, x.url
FROM tenants t CROSS JOIN (VALUES
  ('ppa',2026,'PPA 2026-2029 e anexos','https://prefeitura.lidera.app.br/doc/ppa-2026.pdf'),
  ('ldo',2026,'LDO 2026 e anexos','https://prefeitura.lidera.app.br/doc/ldo-2026.pdf'),
  ('loa',2026,'LOA 2026 e anexos','https://prefeitura.lidera.app.br/doc/loa-2026.pdf'),
  ('rgf',2026,'Relatório de Gestão Fiscal — 1º quadrimestre/2026','https://prefeitura.lidera.app.br/doc/rgf-2026-q1.pdf'),
  ('rreo',2026,'Relatório Resumido da Execução Orçamentária — 1º bim/2026','https://prefeitura.lidera.app.br/doc/rreo-2026-b1.pdf'),
  ('balanco_geral',2025,'Balanço Geral / Prestação de Contas 2025','https://prefeitura.lidera.app.br/doc/balanco-2025.pdf'),
  ('prestacao_contas',2025,'Prestação de Contas do exercício 2025','https://prefeitura.lidera.app.br/doc/pc-2025.pdf'),
  ('regulamento_lai',2024,'Decreto municipal que regulamenta a LAI','https://prefeitura.lidera.app.br/doc/decreto-lai.pdf'),
  ('relatorio_estatistico_sic',2025,'Relatório estatístico de pedidos e-SIC 2025','https://prefeitura.lidera.app.br/doc/sic-estat-2025.pdf'),
  ('carta_servicos',2026,'Carta de Serviços ao Usuário','https://prefeitura.lidera.app.br/doc/carta-servicos.pdf'),
  ('plano_contratacoes',2026,'Plano de Contratações Anual 2026','https://prefeitura.lidera.app.br/doc/pca-2026.pdf'),
  ('edital_licitacao',2026,'Edital do Pregão Eletrônico 2026-001','https://prefeitura.lidera.app.br/doc/edital-pe-001.pdf'),
  ('contrato',2026,'Contrato CT-2026-001 — íntegra','https://prefeitura.lidera.app.br/doc/contrato-ct-001.pdf'),
  ('concurso',2026,'Edital do Concurso Público 01/2026','https://prefeitura.lidera.app.br/doc/concurso-01-2026.pdf')
) AS x(categoria, exercicio, titulo, url)
WHERE t.slug = 'prefeitura'
ON CONFLICT DO NOTHING;

-- ---------------- Transparência: datasets tabulares ----------------
INSERT INTO transp_diarias (tenant_id, exercicio, documento, beneficiario, cargo, destino, valor_total, data_inicio)
SELECT id,2026,'2026D0001','Carlos Pereira','Secretário de Saúde','Brasília/DF',2400.00,'2026-04-10' FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_obras (tenant_id, exercicio, identificador, objeto, situacao, contratada, valor_contratado, valor_executado, bairro)
SELECT id,2026,'OBRA-2026-01','Pavimentação da Av. Central','em_andamento','Construtora Alpha LTDA',800000,350000,'Centro' FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_divida_ativa (tenant_id, exercicio, inscricao, inscrito_nome, inscrito_doc, natureza, valor)
SELECT id,2026,'DA-001','Empresa Beta LTDA','11222333000181','IPTU',12500.00 FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_terceirizados (tenant_id, exercicio, vinculo, registro, nome, empresa, cargo, remuneracao)
SELECT id,2026,'terceirizado','T-001','José Lima','Limpa Tudo ME','Auxiliar de Limpeza',1800.00 FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_convenios (tenant_id, exercicio, numero, tipo, participe, objeto, valor)
SELECT id,2026,'CV-2026-01','recebido','Governo do Estado','Reforma de escola',500000 FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_licitacoes (tenant_id, exercicio, numero, modalidade, objeto, valor_estimado, situacao, data_abertura)
SELECT id,2026,'PE-2026-001','Pregão Eletrônico','Aquisição de medicamentos',300000,'homologada','2026-03-01' FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_contratos (tenant_id, exercicio, numero, fornecedor_nome, fornecedor_doc, objeto, valor)
SELECT id,2026,'CT-2026-001','Farma Distribuidora SA','99888777000166','Fornecimento de medicamentos',300000 FROM tenants WHERE slug='prefeitura' ON CONFLICT DO NOTHING;

INSERT INTO transp_despesas (tenant_id, exercicio, empenho, orgao, credor_nome, credor_doc, valor_empenhado, valor_liquidado, valor_pago, data_empenho)
SELECT id,2026,'2026NE000123','Secretaria de Obras','Construtora Alpha LTDA','11222333000181',150000,120000,100000,'2026-03-15' FROM tenants WHERE slug='prefeitura'
ON CONFLICT (tenant_id, exercicio, empenho) DO NOTHING;

INSERT INTO transp_receitas (tenant_id, exercicio, codigo, descricao, categoria, valor_previsto, valor_arrecadado, data_lancamento)
SELECT id,2026,'1112.04.31','IPTU','corrente',2000000,1500000,'2026-01-31' FROM tenants WHERE slug='prefeitura'
ON CONFLICT (tenant_id, exercicio, codigo, data_lancamento) DO NOTHING;

INSERT INTO transp_folha (tenant_id, exercicio, mes, matricula, nome_servidor, cargo, vinculo, orgao, remuneracao_bruta, descontos, remuneracao_liquida)
SELECT id,2026,5,'00012345','Maria de Souza','Médica','efetivo','Saúde',18000,4000,14000 FROM tenants WHERE slug='prefeitura'
ON CONFLICT (tenant_id, exercicio, mes, matricula) DO NOTHING;

-- ---------------- Atualidade (defasagem por dataset) ----------------
INSERT INTO transp_sync_log (tenant_id, dataset, origem, registros, status)
SELECT t.id, d, 'seed', 1, 'ok' FROM tenants t CROSS JOIN (VALUES
  ('documentos'),('diarias'),('obras'),('divida-ativa'),('terceirizados'),
  ('convenios'),('licitacoes'),('contratos'),('despesas'),('receitas'),('folha')) AS x(d)
WHERE t.slug = 'prefeitura';
