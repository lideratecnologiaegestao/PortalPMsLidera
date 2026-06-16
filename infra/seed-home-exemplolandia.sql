-- Semeia a home do tenant Exemplolândia (criado antes do provisionamento da home).
-- tenant_id fixo do Exemplolândia.
\set tid '7308d932-5d84-4c6b-a80d-caccc294a7c4'

INSERT INTO banners (tenant_id, titulo, subtitulo, cta_label, link_url, ordem, ativo) VALUES
 (:'tid','Bem-vindo a Exemplolândia','Serviços, transparência e ouvidoria em um só lugar','Ver serviços','/servicos',0,true),
 (:'tid','Transparência Municipal','Acompanhe receitas, despesas e contratos','Acessar','/transparencia',1,true),
 (:'tid','Ouvidoria Digital','Registre manifestações, denúncias e elogios','Abrir ouvidoria','/ouvidoria',2,true)
ON CONFLICT DO NOTHING;

INSERT INTO noticias (tenant_id, slug, titulo, resumo, conteudo, categoria, autor, publicado, publicado_em) VALUES
 (:'tid','mutirao-saude-2026','Prefeitura realiza mutirão de saúde','Atendimentos gratuitos em todas as unidades neste fim de semana.','A Secretaria de Saúde promove um mutirão com consultas, exames e vacinação para toda a população.','Saúde','Comunicação',true,now()),
 (:'tid','obras-pavimentacao','Novas obras de pavimentação começam no centro','Investimento em infraestrutura urbana melhora a mobilidade.','As obras de pavimentação da região central iniciam nesta semana, com previsão de conclusão em 90 dias.','Obras','Comunicação',true,now() - interval '1 day'),
 (:'tid','matriculas-abertas','Matrículas abertas na rede municipal de ensino','Período de inscrição para o ano letivo já começou.','As matrículas para a rede municipal estão abertas. Confira os documentos necessários e os locais de atendimento.','Educação','Comunicação',true,now() - interval '2 day')
ON CONFLICT (tenant_id, slug) DO NOTHING;

INSERT INTO secretarias (tenant_id, nome, sigla, responsavel, descricao, ordem, ativo) VALUES
 (:'tid','Secretaria de Saúde','SMS','Maria Oliveira','Gestão da rede municipal de saúde e atenção básica.',0,true),
 (:'tid','Secretaria de Educação','SME','João Pereira','Educação infantil e ensino fundamental do município.',1,true),
 (:'tid','Secretaria de Obras','SMO','Carlos Souza','Infraestrutura, pavimentação e serviços urbanos.',2,true),
 (:'tid','Secretaria de Administração','SEAD','Ana Lima','Gestão administrativa, pessoal e finanças.',3,true)
ON CONFLICT DO NOTHING;
