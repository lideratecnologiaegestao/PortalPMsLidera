-- =====================================================================
-- 043 — Fase 1: Popups + Banners(datas/HTML) + Notícias(crédito) + senha
-- =====================================================================

-- ── Popups ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS popups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo          text,
  tipo            text NOT NULL DEFAULT 'imagem',   -- imagem|video|youtube|html
  imagem_url      text,
  link_url        text,
  youtube         text,
  video_url       text,
  conteudo_html   text,
  pagina          text,                             -- rota onde exibir; NULL = todas
  mostrar_titulo  boolean NOT NULL DEFAULT true,
  ativo           boolean NOT NULL DEFAULT true,
  inicio_em       timestamptz,
  fim_em          timestamptz,
  frequencia_horas integer NOT NULL DEFAULT 24,     -- intervalo mínimo entre exibições (por visitante)
  ordem           integer NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_popup_ativo ON popups (tenant_id, ativo, ordem);
SELECT app_enable_tenant_rls('popups');

-- ── Banners: datas de início/fim + conteúdo HTML ─────────────────────
ALTER TABLE banners
  ADD COLUMN IF NOT EXISTS inicio_em     timestamptz,
  ADD COLUMN IF NOT EXISTS fim_em        timestamptz,
  ADD COLUMN IF NOT EXISTS conteudo_html text;

-- ── Notícias: fonte/legenda/crédito + data de encerramento ───────────
ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS fonte     text,
  ADD COLUMN IF NOT EXISTS legenda   text,
  ADD COLUMN IF NOT EXISTS credito   text,
  ADD COLUMN IF NOT EXISTS encerra_em timestamptz;

-- ── Usuários: data da última troca de senha (política de expiração) ──
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS senha_alterada_em timestamptz;
