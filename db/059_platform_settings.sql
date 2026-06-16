-- =====================================================================
-- 059 — Configurações GLOBAIS da plataforma (singleton, super_admin)
-- =====================================================================
-- Console da plataforma (Lidera): config que NÃO é por tenant. Linha única
-- (id=1). SEM RLS — acesso só pelo super_admin via prisma.platform(). Segredos
-- cifrados (secret-box, AES-256-GCM). Evita depender do .env para o que é config.
-- =====================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  id                integer     PRIMARY KEY DEFAULT 1,
  -- "Desenvolvido por" (empresa dona do sistema)
  dev_ativo         boolean     NOT NULL DEFAULT true,   -- mostra crédito no rodapé
  dev_nome          text,                                -- "Lidera Tecnologia"
  dev_razao_social  text,                                -- "Lidera Tecnologia e Gestão LTDA"
  dev_cnpj          text,
  dev_endereco      text,
  dev_email         text,
  dev_suporte_url   text,                                -- canal de suporte
  dev_whatsapp      text,
  dev_site_url      text,                                -- link do crédito no rodapé
  dev_logo_url      text,
  -- SMTP GLOBAL (fallback p/ entidades sem SMTP próprio)
  smtp_ativo        boolean     NOT NULL DEFAULT false,
  smtp_host         text,
  smtp_port         integer,
  smtp_secure       boolean     NOT NULL DEFAULT false,
  smtp_user         text,
  smtp_pass_cifrado text,                                -- cifrado
  smtp_from         text,
  -- Backups (config; destino e execução evoluem depois)
  backup            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Extras (migração incremental do .env)
  dados             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_por    uuid,
  CONSTRAINT platform_settings_singleton CHECK (id = 1)
);

COMMENT ON TABLE platform_settings IS 'Configuração global da plataforma (Lidera) — linha única (id=1). Sem RLS; só super_admin. Segredos cifrados.';

-- Seed da linha única com a identidade da Lidera (campos detalhados ficam p/ o painel).
INSERT INTO platform_settings (id, dev_ativo, dev_nome, dev_razao_social, dev_site_url)
VALUES (1, true, 'Lidera Tecnologia', 'Lidera Tecnologia e Gestão LTDA', 'https://lidera.app.br')
ON CONFLICT (id) DO NOTHING;
