-- =====================================================================
-- 039 — Enquetes (poll) — voto anônimo, sem dado pessoal (LGPD)
-- =====================================================================
-- O controle de "1 voto" usa um HASH anônimo (IP+User-Agent+segredo) — NÃO
-- guarda IP nem identidade em claro. Finalidade: evitar votos repetidos.
-- =====================================================================

CREATE TABLE enquetes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pergunta   text NOT NULL,
  ativa      boolean NOT NULL DEFAULT false,
  encerrada  boolean NOT NULL DEFAULT false,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_enquete_ativa ON enquetes (tenant_id, ativa);
SELECT app_enable_tenant_rls('enquetes');

CREATE TABLE enquete_opcoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enquete_id uuid NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
  texto      text NOT NULL,
  ordem      integer NOT NULL DEFAULT 0,
  votos      integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_opcao_enquete ON enquete_opcoes (tenant_id, enquete_id, ordem);
SELECT app_enable_tenant_rls('enquete_opcoes');

CREATE TABLE enquete_votos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enquete_id   uuid NOT NULL REFERENCES enquetes(id) ON DELETE CASCADE,
  opcao_id     uuid NOT NULL REFERENCES enquete_opcoes(id) ON DELETE CASCADE,
  votante_hash text NOT NULL,   -- sha256(ip+ua+enquete+segredo) — anônimo (LGPD)
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enquete_id, votante_hash)
);
SELECT app_enable_tenant_rls('enquete_votos');
