-- =====================================================================
-- 104 — Agenda Administrativa: calendário unificado
-- =====================================================================
-- Agenda dedicada e MELHORADA em relação ao Laravel antigo (que usava a tabela
-- `eventos` com um enum e SEM recorrência): tabela própria com dia-inteiro,
-- timezone IANA por item, RECORRÊNCIA ANUAL (feriados/datas comemorativas
-- repetem todo ano — expandido no serviço) e tipos dedicados (feriado, ponto
-- facultativo, data comemorativa, reunião, programação, prazo…).
--
-- O calendário sobrepõe (read-only) os eventos das secretarias — feito no
-- AgendaService, sem FK aqui. Tenant-scoped + RLS. Ver api/src/modules/agenda/.
-- =====================================================================

CREATE TABLE IF NOT EXISTS agenda_itens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo          text        NOT NULL DEFAULT 'evento',
  titulo        text        NOT NULL,
  descricao     text,
  local         text,
  link          text,
  inicio        timestamptz NOT NULL,
  fim           timestamptz,
  dia_inteiro   boolean     NOT NULL DEFAULT false,
  timezone      text        NOT NULL DEFAULT 'America/Cuiaba', -- IANA, por item
  cor           text,                                          -- hex opcional (default por tipo no front)
  recorrencia   text        NOT NULL DEFAULT 'nenhuma',        -- nenhuma | anual
  destaque      boolean     NOT NULL DEFAULT false,
  publico       boolean     NOT NULL DEFAULT true,             -- aparece na agenda pública
  ativo         boolean     NOT NULL DEFAULT true,
  ordem         integer     NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_tipo_check CHECK (tipo IN (
    'evento','reuniao','audiencia_publica','feriado','ponto_facultativo',
    'data_comemorativa','programacao','prazo','outro')),
  CONSTRAINT agenda_recorrencia_check CHECK (recorrencia IN ('nenhuma','anual'))
);
CREATE INDEX IF NOT EXISTS idx_agenda_periodo ON agenda_itens (tenant_id, inicio);
CREATE INDEX IF NOT EXISTS idx_agenda_tipo    ON agenda_itens (tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_agenda_pub     ON agenda_itens (tenant_id, ativo, publico, inicio);
SELECT app_enable_tenant_rls('agenda_itens');

-- ---- GRANT ao role da aplicação (tabela nova; idempotente) ---------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agenda_itens TO portal_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portal_ro') THEN
    GRANT SELECT ON agenda_itens TO portal_ro;
  END IF;
END$$;

-- ---- Seed: feriados nacionais fixos (recorrência ANUAL) por tenant --------
-- Uma linha por feriado (ano-base 2026); o serviço expande p/ os demais anos.
-- Idempotente: só insere se o tenant ainda não tem aquele feriado.
INSERT INTO agenda_itens (tenant_id, tipo, titulo, inicio, dia_inteiro, recorrencia, publico, cor)
SELECT t.id, 'feriado', f.titulo,
       make_timestamptz(2026, f.mes, f.dia, 0, 0, 0, 'America/Cuiaba'),
       true, 'anual', true, '#dc3545'
FROM tenants t
CROSS JOIN (VALUES
  (1,  1,  'Confraternização Universal'),
  (4,  21, 'Tiradentes'),
  (5,  1,  'Dia do Trabalho'),
  (9,  7,  'Independência do Brasil'),
  (10, 12, 'Nossa Senhora Aparecida'),
  (11, 2,  'Finados'),
  (11, 15, 'Proclamação da República'),
  (11, 20, 'Consciência Negra'),
  (12, 25, 'Natal')
) AS f(mes, dia, titulo)
WHERE NOT EXISTS (
  SELECT 1 FROM agenda_itens a
  WHERE a.tenant_id = t.id AND a.tipo = 'feriado' AND a.titulo = f.titulo AND a.recorrencia = 'anual'
);
