-- =====================================================================
-- 003 — Motor de temas (design tokens por tenant) + CMS de blocos
-- =====================================================================
-- O tema é armazenado como JSONB validado pela aplicação. O Next.js lê
-- esses tokens e injeta como CSS custom properties (var(--color-primary)).
-- O Tailwind é configurado para consumir essas variáveis.
-- =====================================================================

CREATE TABLE tenant_themes (
  tenant_id    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  -- estrutura esperada de `tokens` (validada no app por Zod):
  -- {
  --   "colors": { "primary","primaryFg","secondary","secondaryFg","accent",
  --               "bg","fg","muted","border","success","warning","danger" },
  --   "fonts":  { "sans","heading" },
  --   "radius": { "base" },          -- ex.: "0.5rem"
  --   "logo":   { "url","alt" },
  --   "favicon": "url",
  --   "iconSet": "lucide"            -- conjunto de ícones
  -- }
  tokens        jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- selo de acessibilidade calculado no save (contraste WCAG dos pares de cor)
  wcag_ok       boolean NOT NULL DEFAULT false,
  wcag_relatorio jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenant_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_themes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_themes
  USING      (app_is_platform() OR tenant_id = app_current_tenant())
  WITH CHECK (app_is_platform() OR tenant_id = app_current_tenant());

-- Páginas compostas por blocos (home, "História do Município", etc.)
CREATE TABLE cms_pages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug         text NOT NULL,                 -- "home", "historia", "secretaria/saude"
  titulo       text NOT NULL,
  publicado    boolean NOT NULL DEFAULT false,
  seo          jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
SELECT app_enable_tenant_rls('cms_pages');

-- Blocos da página (hero, cards de serviço, galeria, lista de notícias…).
-- `tipo` define o componente React que renderiza; `conteudo` são os props.
CREATE TABLE cms_blocks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_id      uuid NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  tipo         text NOT NULL,                  -- "hero" | "servicos" | "noticias" | ...
  conteudo     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem        int NOT NULL DEFAULT 0,
  visivel      boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_cms_blocks_page ON cms_blocks (page_id, ordem);
SELECT app_enable_tenant_rls('cms_blocks');
