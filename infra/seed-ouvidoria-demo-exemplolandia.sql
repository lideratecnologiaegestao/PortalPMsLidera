-- Manifestações de EXEMPLO para o tenant demo (exemplolandia), apenas para
-- demonstrar os gráficos da home e o painel do ouvidor. Conteúdo fictício.
SET client_encoding TO 'UTF8';

DO $$
DECLARE
  v_t uuid;
  m1 uuid;
  m6 uuid;
BEGIN
  SELECT id INTO v_t FROM tenants WHERE slug = 'exemplolandia';
  IF v_t IS NULL THEN RAISE EXCEPTION 'tenant exemplolandia não encontrado'; END IF;

  -- idempotência: não duplica se já semeado
  IF EXISTS (SELECT 1 FROM manifestacoes WHERE tenant_id = v_t AND protocolo LIKE '2026009%') THEN
    RAISE NOTICE 'demo já semeada'; RETURN;
  END IF;

  -- Concluídas / respondidas (alimentam taxa no prazo e tempo médio)
  INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, status, assunto, descricao, prazo_em, respondido_em, resposta, criado_em)
  VALUES (v_t,'2026009001','ouvidoria','reclamacao','concluida','Buraco na Rua das Flores','Há um buraco na via que oferece risco aos veículos.', now()-interval '120 days', now()-interval '143 days', 'Equipe da Secretaria de Obras realizou o reparo. Agradecemos o aviso.', now()-interval '150 days')
  RETURNING id INTO m1;

  INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, status, assunto, descricao, prazo_em, respondido_em, resposta, criado_em) VALUES
   (v_t,'2026009002','ouvidoria','sugestao','respondida','Mais iluminação na praça','Sugiro reforço de iluminação na praça central.', now()-interval '90 days', now()-interval '100 days','Sugestão encaminhada ao planejamento de iluminação pública.', now()-interval '120 days'),
   (v_t,'2026009003','esic','acesso_informacao','concluida','Despesas com merenda escolar','Solicito o detalhamento das despesas com merenda em 2025.', now()-interval '80 days', now()-interval '92 days','Informação disponibilizada no Portal da Transparência.', now()-interval '100 days'),
   (v_t,'2026009004','ouvidoria','elogio','concluida','Atendimento na UBS Central','Quero elogiar o atendimento recebido na UBS.', now()-interval '50 days', now()-interval '78 days','Obrigado! Repassamos o elogio à equipe.', now()-interval '80 days'),
   (v_t,'2026009005','esic','acesso_informacao','respondida','Contratos de limpeza urbana','Peço cópia dos contratos vigentes de limpeza urbana.', now()-interval '30 days', now()-interval '35 days','Contratos enviados em anexo e publicados na transparência.', now()-interval '50 days');

  -- Em andamento (alimentam "em andamento" e o painel do ouvidor)
  INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, status, anonima, assunto, descricao, prazo_em, criado_em)
  VALUES (v_t,'2026009006','ouvidoria','denuncia','em_tratamento', true,'Descarte irregular de lixo','Denúncia de descarte irregular de entulho em terreno baldio.', now()+interval '10 days', now()-interval '20 days')
  RETURNING id INTO m6;

  INSERT INTO manifestacoes (tenant_id, protocolo, canal, tipo, status, assunto, descricao, prazo_em, criado_em) VALUES
   (v_t,'2026009007','ouvidoria','solicitacao','em_analise','Poda de árvore na Av. Brasil','Solicito poda de árvore que toca a fiação.', now()+interval '20 days', now()-interval '10 days'),
   (v_t,'2026009008','esic','acesso_informacao','registrada','Diárias pagas em 2026','Solicito a relação de diárias pagas no exercício.', now()+interval '17 days', now()-interval '3 days');

  -- Eventos + chat de exemplo para a concluída m1
  INSERT INTO manifestacao_eventos (tenant_id, manifestacao_id, de_status, para_status, evento, criado_em) VALUES
   (v_t, m1, NULL, 'registrada', 'registrar', now()-interval '150 days'),
   (v_t, m1, 'registrada', 'em_analise', 'iniciar_analise', now()-interval '149 days'),
   (v_t, m1, 'em_analise', 'em_tratamento', 'encaminhar_area', now()-interval '148 days'),
   (v_t, m1, 'em_tratamento', 'respondida', 'responder', now()-interval '143 days'),
   (v_t, m1, 'respondida', 'concluida', 'concluir', now()-interval '141 days');

  INSERT INTO manifestacao_mensagens (tenant_id, manifestacao_id, autor_tipo, autor_nome, conteudo, interno, criado_em) VALUES
   (v_t, m1, 'cidadao', NULL, 'Há um buraco grande na via, está perigoso.', false, now()-interval '150 days'),
   (v_t, m1, 'servidor', 'Ouvidoria', 'Encaminhado à Secretaria de Obras para vistoria.', true,  now()-interval '148 days'),
   (v_t, m1, 'servidor', 'Ouvidoria', 'Equipe enviada e reparo concluído. Obrigado pelo aviso!', false, now()-interval '143 days');

  -- Chat de exemplo para a denúncia em andamento m6
  INSERT INTO manifestacao_eventos (tenant_id, manifestacao_id, de_status, para_status, evento, criado_em) VALUES
   (v_t, m6, NULL, 'registrada', 'registrar', now()-interval '20 days'),
   (v_t, m6, 'registrada', 'em_analise', 'iniciar_analise', now()-interval '19 days');
  INSERT INTO manifestacao_mensagens (tenant_id, manifestacao_id, autor_tipo, autor_nome, conteudo, interno, criado_em) VALUES
   (v_t, m6, 'cidadao', NULL, 'Há entulho sendo descartado no terreno da esquina há dias.', false, now()-interval '20 days'),
   (v_t, m6, 'servidor', 'Ouvidoria', 'Fiscalização acionada para verificar o local.', true, now()-interval '18 days');
END $$;

SELECT canal, status, count(*) FROM manifestacoes
WHERE tenant_id = (SELECT id FROM tenants WHERE slug='exemplolandia')
GROUP BY canal, status ORDER BY canal, status;
