-- Demo: instala 2 campanhas ativas para o tenant exemplolandia (validação ao vivo).
-- Executar como postgres (bootstrap). RLS não bloqueia o superusuário.
-- Configs fiéis aos presets de api/src/modules/campanhas/seeds/biblioteca.ts.

DO $$
DECLARE
  t uuid := '7308d932-5d84-4c6b-a80d-caccc294a7c4'; -- exemplolandia
BEGIN
  PERFORM set_config('app.is_platform', 'on', true);

  -- limpa instâncias anteriores desta demo (idempotente)
  DELETE FROM campaign WHERE tenant_id = t AND template_key IN ('dengue','outubro-rosa');

  -- Dengue: efeito aedes-overlay + faixa + popup
  INSERT INTO campaign (tenant_id, template_key, nome, status, prioridade, config)
  VALUES (t, 'dengue', 'Combate à Dengue / Aedes aegypti', 'active', 200, $json$
  {
    "efeito": {
      "nome": "aedes-overlay",
      "params": {
        "quantidadeMosquitos": 5,
        "corPrimaria": "#294961",
        "corDestaque": "#f0a830",
        "zIndex": 9000,
        "titulo": "Combate ao Aedes aegypti",
        "subtitulo": "10 minutos contra a dengue",
        "descricao": "Elimine criadouros de água parada em sua casa e ajude a proteger toda a comunidade.",
        "bullets": ["Verifique vasos, pneus, caixas d'água e calhas","Mantenha recipientes tampados","Jogue fora o lixo que acumula água"],
        "ctaLabel": "Denunciar foco do mosquito",
        "ctaUrl": "/ouvidoria",
        "reabrirAposDias": 7
      }
    },
    "faixa": {
      "mensagem": "🦟 Alerta Dengue: elimine água parada e proteja sua família!",
      "corBg": "#c8372d",
      "corTexto": "#ffffff",
      "dismissivel": true
    },
    "popup": {
      "titulo": "Alerta: Dengue",
      "descricao": "Estamos no período de risco para a dengue. Elimine criadouros de água parada e proteja sua família.",
      "bullets": ["Verifique vasos, pneus e caixas d'água","Mantenha lixo fechado","Procure o posto de saúde se tiver febre"],
      "ctaLabel": "Saiba mais",
      "ctaUrl": "/servicos/saude",
      "frequencia": "dia",
      "reabrirAposDias": 3
    }
  }
  $json$::jsonb);

  -- Outubro Rosa: tema + faixa + popup (prioridade maior → controla tema/popup)
  INSERT INTO campaign (tenant_id, template_key, nome, status, prioridade, config)
  VALUES (t, 'outubro-rosa', 'Outubro Rosa — Câncer de Mama', 'active', 300, $json$
  {
    "tema": { "corPrimaria": "#e91e8c", "corPrimariaFg": "#000000", "aplicarEm": "todo" },
    "faixa": {
      "mensagem": "🎀 Outubro Rosa: previna-se! Faça sua mamografia e cuide da sua saúde.",
      "corBg": "#e91e8c",
      "corTexto": "#ffffff",
      "dismissivel": true
    },
    "popup": {
      "titulo": "Outubro Rosa",
      "subtitulo": "Mês de Prevenção ao Câncer de Mama",
      "descricao": "O diagnóstico precoce salva vidas. Agende sua mamografia no posto de saúde.",
      "bullets": ["Mulheres de 40 a 69 anos: faça mamografia anual","Autoexame mensal após a menstruação","Atendimento gratuito pelo SUS"],
      "ctaLabel": "Agendar consulta",
      "ctaUrl": "/servicos/saude",
      "frequencia": "dia",
      "reabrirAposDias": 7
    }
  }
  $json$::jsonb);

  RAISE NOTICE 'Campanhas demo instaladas para exemplolandia';
END $$;

SELECT nome, status, prioridade, jsonb_object_keys(config) AS capacidade
FROM campaign WHERE tenant_id = '7308d932-5d84-4c6b-a80d-caccc294a7c4'
ORDER BY prioridade DESC;
