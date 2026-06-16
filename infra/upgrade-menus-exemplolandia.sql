-- Atualiza os menus do tenant exemplolandia para a nova estrutura de
-- transparência (cabeçalho com dropdown completo; rodapé com Dados Abertos,
-- Documentos e grupo Cidadão). Idempotente. Preserva os itens automáticos das
-- secretarias (ref_tipo='secretaria').
SET client_encoding TO 'UTF8';

DO $$
DECLARE
  v_tenant uuid;
  v_transp_cab uuid;
  v_transp_rod uuid;
  v_cidadao uuid;
BEGIN
  SELECT id INTO v_tenant FROM tenants WHERE slug = 'exemplolandia';
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'tenant exemplolandia não encontrado'; END IF;

  -- 1) Cabeçalho: "Transparência" (link único) vira grupo (dropdown)
  SELECT id INTO v_transp_cab FROM menu_items
   WHERE tenant_id = v_tenant AND local = 'cabecalho' AND parent_id IS NULL
     AND href = '/transparencia' LIMIT 1;

  IF v_transp_cab IS NOT NULL THEN
    UPDATE menu_items SET tipo = 'grupo', href = NULL WHERE id = v_transp_cab;
    DELETE FROM menu_items WHERE parent_id = v_transp_cab;
    INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem, ativo) VALUES
      (v_tenant,'cabecalho',v_transp_cab,'Visão geral','interno','/transparencia',0,true),
      (v_tenant,'cabecalho',v_transp_cab,'Receitas','interno','/transparencia/receitas',1,true),
      (v_tenant,'cabecalho',v_transp_cab,'Despesas','interno','/transparencia/despesas',2,true),
      (v_tenant,'cabecalho',v_transp_cab,'Folha de Pagamento','interno','/transparencia/folha',3,true),
      (v_tenant,'cabecalho',v_transp_cab,'Licitações','interno','/transparencia/licitacoes',4,true),
      (v_tenant,'cabecalho',v_transp_cab,'Contratos','interno','/transparencia/contratos',5,true),
      (v_tenant,'cabecalho',v_transp_cab,'Obras','interno','/transparencia/obras',6,true),
      (v_tenant,'cabecalho',v_transp_cab,'Documentos e Planejamento','interno','/transparencia/documentos',7,true),
      (v_tenant,'cabecalho',v_transp_cab,'Dados Abertos','interno','/transparencia/dados-abertos',8,true);
  END IF;

  -- 2) Rodapé: refaz os filhos do grupo Transparência
  SELECT parent_id INTO v_transp_rod FROM menu_items
   WHERE tenant_id = v_tenant AND local = 'rodape' AND href = '/transparencia'
     AND parent_id IS NOT NULL LIMIT 1;

  IF v_transp_rod IS NOT NULL THEN
    DELETE FROM menu_items WHERE parent_id = v_transp_rod;
    INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem, ativo) VALUES
      (v_tenant,'rodape',v_transp_rod,'Portal da Transparência','interno','/transparencia',0,true),
      (v_tenant,'rodape',v_transp_rod,'Documentos e Planejamento','interno','/transparencia/documentos',1,true),
      (v_tenant,'rodape',v_transp_rod,'Dados Abertos','interno','/transparencia/dados-abertos',2,true);
  END IF;

  -- 3) Rodapé: grupo "Cidadão" (Ouvidoria, e-SIC, Carta de Serviços)
  SELECT id INTO v_cidadao FROM menu_items
   WHERE tenant_id = v_tenant AND local = 'rodape' AND parent_id IS NULL
     AND label = 'Cidadão' AND tipo = 'grupo' LIMIT 1;

  IF v_cidadao IS NULL THEN
    INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem, ativo)
    VALUES (v_tenant,'rodape',NULL,'Cidadão','grupo',NULL,3,true)
    RETURNING id INTO v_cidadao;

    INSERT INTO menu_items (tenant_id, local, parent_id, label, tipo, href, ordem, ativo) VALUES
      (v_tenant,'rodape',v_cidadao,'Ouvidoria','interno','/ouvidoria',0,true),
      (v_tenant,'rodape',v_cidadao,'e-SIC — Acesso à Informação','interno','/esic',1,true),
      (v_tenant,'rodape',v_cidadao,'Carta de Serviços','interno','/transparencia/documentos',2,true);
  END IF;
END $$;

\echo '---RESULTADO CABECALHO TRANSPARENCIA---'
SELECT m.ordem, m.label, m.href FROM menu_items m
WHERE m.parent_id = (
  SELECT id FROM menu_items WHERE tenant_id=(SELECT id FROM tenants WHERE slug='exemplolandia')
    AND local='cabecalho' AND parent_id IS NULL AND tipo='grupo' AND href IS NULL
    AND id IN (SELECT parent_id FROM menu_items WHERE href='/transparencia/dados-abertos' AND local='cabecalho')
) ORDER BY m.ordem;
