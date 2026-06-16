-- Fecha as lacunas do PNTP do tenant 'demo' até o selo Diamante:
-- páginas institucionais/LGPD/mapa do site (CMS) + documentos faltantes.
DO $$
DECLARE t uuid; pg uuid;
BEGIN
  SELECT id INTO t FROM tenants WHERE slug = 'demo';
  IF t IS NULL THEN RETURN; END IF;

  -- Páginas CMS exigidas (institucional, acessibilidade, LGPD)
  INSERT INTO cms_pages (tenant_id, slug, titulo, publicado) VALUES
    (t,'institucional/estrutura','Estrutura Organizacional',true),
    (t,'institucional/contatos','Endereços, Telefones e E-mails',true),
    (t,'institucional/faq','Perguntas Frequentes',true),
    (t,'mapa-do-site','Mapa do Site',true),
    (t,'privacidade/encarregado','Encarregado de Dados (DPO)',true),
    (t,'privacidade/politica','Política de Privacidade e Proteção de Dados',true)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET publicado = true;

  -- bloco de texto em cada página nova (conteúdo mínimo)
  INSERT INTO cms_blocks (tenant_id, page_id, tipo, conteudo)
  SELECT p.tenant_id, p.id, 'texto',
         jsonb_build_object('titulo', p.titulo, 'corpo', 'Conteúdo institucional da Prefeitura de Demonstração.')
  FROM cms_pages p
  WHERE p.tenant_id = t
    AND p.slug IN ('institucional/estrutura','institucional/contatos','institucional/faq','mapa-do-site','privacidade/encarregado','privacidade/politica')
    AND NOT EXISTS (SELECT 1 FROM cms_blocks b WHERE b.page_id = p.id);

  -- Documentos faltantes (editais, contratos, concursos)
  INSERT INTO transp_documentos (tenant_id, categoria, exercicio, titulo, url_externa) VALUES
    (t,'edital_licitacao',2026,'Edital do Pregão Eletrônico 2026-001','https://demo.gov.br/edital-pe-001.pdf'),
    (t,'contrato',2026,'Contrato CT-2026-001 — íntegra','https://demo.gov.br/contrato-ct-001.pdf'),
    (t,'concurso',2026,'Edital do Concurso Público 01/2026','https://demo.gov.br/concurso-01-2026.pdf')
  ON CONFLICT DO NOTHING;
END $$;
