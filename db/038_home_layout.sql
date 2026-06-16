-- =====================================================================
-- 038 — Layout configurável da Home (Acesso Rápido + slider lateral)
-- =====================================================================
-- Permite ao gestor (admin) configurar, por tenant:
--  - a seção "Acesso Rápido" em 1 ou 2 colunas;
--  - em 1 coluna: quantos cards por linha (4 a 6);
--  - em 2 colunas: de que lado ficam os cards (e o slider do lado oposto);
--  - o slider lateral (imagem, HTML, vídeo upload, YouTube ou shortcode).
--  - ajustes de card: estilo do ícone (círculo/quadrado) e cor de destaque.
-- E gerenciar os ATALHOS (cards) exibidos.
-- =====================================================================

-- Config única por tenant (1 linha).
CREATE TABLE home_config (
  tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  ar_colunas       smallint NOT NULL DEFAULT 1,            -- 1 ou 2
  ar_cards_linha   smallint NOT NULL DEFAULT 4,            -- 4..6 (modo 1 coluna)
  ar_lado_cards    text     NOT NULL DEFAULT 'esquerda',   -- esquerda|direita (modo 2 colunas)
  card_icone_forma text     NOT NULL DEFAULT 'circulo',    -- circulo|quadrado
  card_cor_destaque text,                                  -- hex opcional; null = usa o primary do tema
  -- Slider lateral (modo 2 colunas)
  slider_tipo      text     NOT NULL DEFAULT 'imagem',     -- imagem|html|video|youtube|enquete
  slider_imagem    text,                                   -- caminho da Biblioteca de Mídia
  slider_link      text,                                   -- link ao clicar (imagem)
  slider_html      text,                                   -- HTML livre
  slider_video     text,                                   -- caminho .mp4 da Biblioteca de Mídia
  slider_youtube   text,                                   -- ID/URL do YouTube
  slider_enquete_id uuid,                                  -- enquete a exibir (FK lógica; módulo na fase C)
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
SELECT app_enable_tenant_rls('home_config');

-- Atalhos (cards) do Acesso Rápido.
CREATE TABLE home_atalhos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label       text NOT NULL,
  descricao   text,
  href        text NOT NULL,
  icone       text NOT NULL DEFAULT 'link',   -- chave de um ícone do catálogo
  ordem       integer NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_home_atalho ON home_atalhos (tenant_id, ordem);
SELECT app_enable_tenant_rls('home_atalhos');
