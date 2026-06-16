-- Semeia os menus default do Exemplolândia (criado antes do provisionamento de menus).
-- Espelha o semeiarMenus do TenantProvisioningService. Idempotente: só roda se o
-- tenant ainda não tem menus.
DO $$
DECLARE
  t uuid := '7308d932-5d84-4c6b-a80d-caccc294a7c4';
  g_prefeitura uuid; g_secretarias uuid; g_ouvidoria uuid;
  c_portal uuid; c_servicos uuid; c_transp uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM menu_items WHERE tenant_id = t) THEN
    RAISE NOTICE 'Tenant já tem menus — nada a fazer.';
    RETURN;
  END IF;

  -- ===== CABEÇALHO =====
  INSERT INTO menu_items (tenant_id, local, label, tipo, href, ordem) VALUES
    (t,'cabecalho','Início','interno','/',0);

  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem)
    VALUES (t,'cabecalho','A Prefeitura','grupo',1) RETURNING id INTO g_prefeitura;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'cabecalho',g_prefeitura,'Estrutura Organizacional','interno','/institucional/estrutura',0),
    (t,'cabecalho',g_prefeitura,'Contatos','interno','/institucional/contatos',1),
    (t,'cabecalho',g_prefeitura,'Perguntas Frequentes','interno','/institucional/faq',2);

  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem, ref_tipo)
    VALUES (t,'cabecalho','Secretarias','grupo',2,'secretarias_root') RETURNING id INTO g_secretarias;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'cabecalho',g_secretarias,'Todas as secretarias','interno','/secretarias',0);

  INSERT INTO menu_items (tenant_id, local, label, tipo, href, ordem) VALUES
    (t,'cabecalho','Transparência','interno','/transparencia',3),
    (t,'cabecalho','Serviços','interno','/servicos',4),
    (t,'cabecalho','Diário Oficial','interno','/diario',5),
    (t,'cabecalho','Notícias','interno','/noticias',6);

  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem)
    VALUES (t,'cabecalho','Ouvidoria','grupo',7) RETURNING id INTO g_ouvidoria;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'cabecalho',g_ouvidoria,'Ouvidoria','interno','/ouvidoria',0),
    (t,'cabecalho',g_ouvidoria,'e-SIC','interno','/esic',1);

  -- ===== RODAPÉ (colunas) =====
  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem)
    VALUES (t,'rodape','Portal','grupo',0) RETURNING id INTO c_portal;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'rodape',c_portal,'Início','interno','/',0),
    (t,'rodape',c_portal,'Notícias','interno','/noticias',1),
    (t,'rodape',c_portal,'Mapa do Site','interno','/mapa-do-site',2);

  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem)
    VALUES (t,'rodape','Serviços','grupo',1) RETURNING id INTO c_servicos;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'rodape',c_servicos,'Serviços','interno','/servicos',0),
    (t,'rodape',c_servicos,'Diário Oficial','interno','/diario',1);

  INSERT INTO menu_items (tenant_id, local, label, tipo, ordem)
    VALUES (t,'rodape','Transparência','grupo',2) RETURNING id INTO c_transp;
  INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem) VALUES
    (t,'rodape',c_transp,'Transparência','interno','/transparencia',0),
    (t,'rodape',c_transp,'Dados Abertos','interno','/transparencia',1),
    (t,'rodape',c_transp,'Ouvidoria','interno','/ouvidoria',2);

  RAISE NOTICE 'Menus do Exemplolândia semeados.';
END $$;
