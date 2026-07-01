-- =====================================================================
-- 103 — Certificado: multipágina + novos campos, com o cadastro de cidadão
--       (users) como fonte única de identidade (CPF/RG).
-- =====================================================================
-- Diretriz do produto: qualquer inscrição (curso, evento, palestra, seletivo,
-- concurso) puxa a identidade do CADASTRO DE CIDADÃO (users). Portanto CPF/RG
-- passam a morar em `users`; a emissão do certificado grava um SNAPSHOT.
--
-- LGPD: a migration 010 removeu o `cpf` em claro de `users` (mantendo só o
-- `cpf_hash` HMAC p/ deduplicação). Aqui reintroduzimos `cpf` em claro por
-- FINALIDADE ESPECÍFICA (emissão de certificado / inscrições oficiais), como
-- dado do próprio titular no seu cadastro. `cpf_hash` segue existindo p/ dedup.
--
-- Multipágina: o certificado passa a ter N páginas. Espelha o modelo do editor
-- do portal antigo (Polotno): dimensão GLOBAL do template; cada PÁGINA tem seu
-- próprio fundo + seus itens. Introduz `certificate_pages` e `page_id` nos itens.
-- =====================================================================

-- ---- 1) Cadastro de cidadão (users): CPF em claro + RG ------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cpf text,   -- em claro; finalidade específica (certificado/inscrições)
  ADD COLUMN IF NOT EXISTS rg  text;

-- ---- 2) Curso: conteúdo programático -----------------------------------
ALTER TABLE cursos
  ADD COLUMN IF NOT EXISTS conteudo_programatico text;

-- ---- 3) Certificado: snapshots (imutáveis na emissão) ------------------
ALTER TABLE curso_certificados
  ADD COLUMN IF NOT EXISTS data_inicio           date,
  ADD COLUMN IF NOT EXISTS data_conclusao        date,
  ADD COLUMN IF NOT EXISTS conteudo_programatico text,
  ADD COLUMN IF NOT EXISTS cpf                   text,   -- snapshot do cidadão
  ADD COLUMN IF NOT EXISTS rg                    text;

-- ---- 4) Páginas do template (fundo por página) -------------------------
-- Dimensão (largura/altura/orientação) permanece GLOBAL no template; cada
-- página tem só seu fundo próprio + seus itens (via page_id).
CREATE TABLE IF NOT EXISTS certificate_pages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id       uuid        NOT NULL REFERENCES certificate_templates(id) ON DELETE CASCADE,
  ordem             integer     NOT NULL DEFAULT 0,
  fundo_url         text,
  fundo_storage_key text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certificate_pages ON certificate_pages (tenant_id, template_id, ordem);
SELECT app_enable_tenant_rls('certificate_pages');

-- ---- 5) Itens ganham page_id (CASCADE) ---------------------------------
ALTER TABLE certificate_texts
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES certificate_pages(id) ON DELETE CASCADE;
ALTER TABLE certificate_elements
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES certificate_pages(id) ON DELETE CASCADE;
ALTER TABLE certificate_photos
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES certificate_pages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_certificate_texts_page    ON certificate_texts    (page_id, ordem);
CREATE INDEX IF NOT EXISTS idx_certificate_elements_page ON certificate_elements (page_id, ordem);
CREATE INDEX IF NOT EXISTS idx_certificate_photos_page   ON certificate_photos   (page_id, ordem);

-- ---- 6) Backfill: 1 página (ordem 0) por template, herdando o fundo -----
INSERT INTO certificate_pages (tenant_id, template_id, ordem, fundo_url, fundo_storage_key)
SELECT t.tenant_id, t.id, 0, t.fundo_url, t.fundo_storage_key
FROM certificate_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM certificate_pages p WHERE p.template_id = t.id AND p.ordem = 0
);

UPDATE certificate_texts x SET page_id = p.id
FROM certificate_pages p
WHERE p.template_id = x.template_id AND p.ordem = 0 AND x.page_id IS NULL;

UPDATE certificate_elements x SET page_id = p.id
FROM certificate_pages p
WHERE p.template_id = x.template_id AND p.ordem = 0 AND x.page_id IS NULL;

UPDATE certificate_photos x SET page_id = p.id
FROM certificate_pages p
WHERE p.template_id = x.template_id AND p.ordem = 0 AND x.page_id IS NULL;

-- ---- 7) GRANT ao role da aplicação (tabela nova; idempotente) ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON certificate_pages TO portal_app;
  END IF;
END$$;
