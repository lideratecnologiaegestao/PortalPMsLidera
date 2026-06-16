INSERT INTO media_categories (tenant_id, tipo, nome, slug) VALUES
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Logos','logos'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Brasões','brasoes'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Banners','banners'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Notícias','noticias'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Galeria','galeria'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','imagem','Denúncias','denuncias'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','documento','Editais','editais'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','documento','Leis','leis'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','documento','Contratos','contratos'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','documento','Relatórios','relatorios'),
  ('7308d932-5d84-4c6b-a80d-caccc294a7c4','documento','Protocolos','protocolos')
ON CONFLICT (tenant_id, tipo, slug) DO NOTHING;