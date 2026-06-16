-- Seed dos datasets PNTP para o tenant 'demo' (ambiente de teste).
-- Documentos ESSENCIAIS (PPA/LDO/LOA/RGF/RREO/Balanço) + tabulares + sync_log.
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM tenants WHERE slug = 'demo';
  IF t IS NULL THEN RETURN; END IF;

  -- Documentos essenciais e obrigatórios (Planejamento/Prestação de Contas)
  INSERT INTO transp_documentos (tenant_id, categoria, exercicio, titulo, url_externa) VALUES
    (t,'ppa',2026,'PPA 2026-2029 e anexos','https://demo.gov.br/ppa-2026.pdf'),
    (t,'ldo',2026,'LDO 2026 e anexos','https://demo.gov.br/ldo-2026.pdf'),
    (t,'loa',2026,'LOA 2026 e anexos','https://demo.gov.br/loa-2026.pdf'),
    (t,'rgf',2026,'Relatório de Gestão Fiscal — 1º quadrimestre/2026','https://demo.gov.br/rgf-2026-q1.pdf'),
    (t,'rreo',2026,'Relatório Resumido da Execução Orçamentária — 1º bim/2026','https://demo.gov.br/rreo-2026-b1.pdf'),
    (t,'balanco_geral',2025,'Balanço Geral / Prestação de Contas 2025','https://demo.gov.br/balanco-2025.pdf'),
    (t,'prestacao_contas',2025,'Prestação de Contas do exercício 2025','https://demo.gov.br/pc-2025.pdf'),
    (t,'regulamento_lai',2024,'Decreto municipal que regulamenta a LAI','https://demo.gov.br/decreto-lai.pdf'),
    (t,'relatorio_estatistico_sic',2025,'Relatório estatístico de pedidos e-SIC 2025','https://demo.gov.br/sic-estat-2025.pdf'),
    (t,'carta_servicos',2026,'Carta de Serviços ao Usuário','https://demo.gov.br/carta-servicos.pdf'),
    (t,'plano_contratacoes',2026,'Plano de Contratações Anual 2026','https://demo.gov.br/pca-2026.pdf')
  ON CONFLICT DO NOTHING;

  INSERT INTO transp_diarias (tenant_id, exercicio, documento, beneficiario, cargo, destino, valor_total, data_inicio)
    VALUES (t,2026,'2026D0001','Carlos Pereira','Secretário de Saúde','Brasília/DF',2400.00,'2026-04-10') ON CONFLICT DO NOTHING;

  INSERT INTO transp_obras (tenant_id, exercicio, identificador, objeto, situacao, contratada, valor_contratado, valor_executado, bairro)
    VALUES (t,2026,'OBRA-2026-01','Pavimentação da Av. Central','em_andamento','Construtora Alpha LTDA',800000,350000,'Centro') ON CONFLICT DO NOTHING;

  INSERT INTO transp_divida_ativa (tenant_id, exercicio, inscricao, inscrito_nome, inscrito_doc, natureza, valor)
    VALUES (t,2026,'DA-001','Empresa Beta LTDA','11222333000181','IPTU',12500.00) ON CONFLICT DO NOTHING;

  INSERT INTO transp_terceirizados (tenant_id, exercicio, vinculo, registro, nome, empresa, cargo, remuneracao)
    VALUES (t,2026,'terceirizado','T-001','José Lima','Limpa Tudo ME','Auxiliar de Limpeza',1800.00) ON CONFLICT DO NOTHING;

  INSERT INTO transp_convenios (tenant_id, exercicio, numero, tipo, participe, objeto, valor)
    VALUES (t,2026,'CV-2026-01','recebido','Governo do Estado','Reforma de escola',500000) ON CONFLICT DO NOTHING;

  INSERT INTO transp_licitacoes (tenant_id, exercicio, numero, modalidade, objeto, valor_estimado, situacao, data_abertura)
    VALUES (t,2026,'PE-2026-001','Pregão Eletrônico','Aquisição de medicamentos',300000,'homologada','2026-03-01') ON CONFLICT DO NOTHING;

  INSERT INTO transp_contratos (tenant_id, exercicio, numero, fornecedor_nome, fornecedor_doc, objeto, valor)
    VALUES (t,2026,'CT-2026-001','Farma Distribuidora SA','99888777000166','Fornecimento de medicamentos',300000) ON CONFLICT DO NOTHING;

  -- atualidade (defasagem) de cada dataset
  INSERT INTO transp_sync_log (tenant_id, dataset, origem, registros, status)
  SELECT t, d, 'seed', 1, 'ok' FROM (VALUES
    ('documentos'),('diarias'),('obras'),('divida-ativa'),('terceirizados'),
    ('convenios'),('licitacoes'),('contratos')) AS x(d);
END $$;
