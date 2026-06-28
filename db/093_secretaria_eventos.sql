-- =====================================================================
-- 093 — Eventos da secretaria (agenda pública) + unidades vinculadas
-- =====================================================================
-- Cada secretaria pode cadastrar EVENTOS (ex.: "Campanha de Vacinação" da
-- Saúde) com título, descrição, período (início/fim, com ou sem hora, e
-- "dia inteiro"), e as UNIDADES onde acontece. Os eventos aparecem na página
-- pública da secretaria e podem ser exportados para Google Agenda, Outlook e
-- Apple/iPhone (.ics gerado pelo backend).
--
-- Datas em timestamptz (instante absoluto). O fuso (IANA) é guardado por evento
-- para formatar a exibição e o .ics corretamente — não há fuso por tenant.
-- =====================================================================

CREATE TABLE IF NOT EXISTS secretaria_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secretaria_id uuid NOT NULL REFERENCES secretarias(id) ON DELETE CASCADE,
  titulo        text NOT NULL,
  descricao     text,
  local         text,                 -- texto livre opcional (além das unidades)
  imagem_url    text,
  inicio        timestamptz NOT NULL,
  fim           timestamptz,
  dia_inteiro   boolean NOT NULL DEFAULT false,
  timezone      text NOT NULL DEFAULT 'America/Cuiaba',
  ativo         boolean NOT NULL DEFAULT true,
  ordem         integer NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evento_secretaria ON secretaria_eventos (tenant_id, secretaria_id, inicio);
CREATE INDEX IF NOT EXISTS idx_evento_inicio     ON secretaria_eventos (tenant_id, inicio);
SELECT app_enable_tenant_rls('secretaria_eventos');

-- ── Unidades onde o evento acontece (N:N com orgao_unidades) ──────────
CREATE TABLE IF NOT EXISTS secretaria_evento_unidades (
  evento_id  uuid NOT NULL REFERENCES secretaria_eventos(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES orgao_unidades(id)     ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  PRIMARY KEY (evento_id, unidade_id)
);
CREATE INDEX IF NOT EXISTS idx_evento_unidade_unidade ON secretaria_evento_unidades (unidade_id);
SELECT app_enable_tenant_rls('secretaria_evento_unidades');

-- ── atualizado_em automático ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_secretaria_eventos_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_secretaria_eventos_atualizado_em ON secretaria_eventos;
CREATE TRIGGER tg_secretaria_eventos_atualizado_em
  BEFORE UPDATE ON secretaria_eventos
  FOR EACH ROW EXECUTE FUNCTION trg_secretaria_eventos_atualizado_em();
