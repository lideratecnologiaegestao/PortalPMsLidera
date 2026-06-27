-- =====================================================================
-- 086 — APLIC: habilitação por entidade (painel central) + UG + anti-duplicação
-- =====================================================================
-- Fase 0/1 do recurso "buscar do APLIC" na Transparência:
--   1) A fonte APLIC passa a ser LIGADA/DESLIGADA por entidade no Gerenciador
--      (super_admin). Desligada = nada de importação nem vitrine pública.
--   2) Ao habilitar, exige-se o código de 7 dígitos da Unidade Gestora (UG) do
--      TCE-MT. Toda carga importada é VALIDADA contra essa UG (não mistura
--      entidades) e contra a nomenclatura padrão do TCE no nome do arquivo.
--   3) Índices ÚNICOS defensivos nas tabelas de movimento: além do delete+insert
--      por competência do serviço (idempotente), o banco garante que reimportar
--      NÃO duplica empenho/liquidação/pagamento dentro do mesmo escopo.
-- Ver docs/adr/ADR-0002-importacao-aplic-tcemt.md.
-- tenants já tem RLS; aqui só adicionamos colunas/índices (sem nova tabela).
-- =====================================================================

-- ---------- Flags por entidade ----------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS aplic_habilitado boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS aplic_ug text;

COMMENT ON COLUMN tenants.aplic_habilitado IS
  'Liga a fonte APLIC (TCE-MT) na Transparência desta entidade. Default desligado.';
COMMENT ON COLUMN tenants.aplic_ug IS
  'Unidade Gestora (TCE-MT): 7 dígitos. Obrigatória quando aplic_habilitado=true; valida cada carga.';

-- Coerência: UG com exatamente 7 dígitos (quando informada).
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_aplic_ug_chk;
ALTER TABLE tenants ADD CONSTRAINT tenants_aplic_ug_chk
  CHECK (aplic_ug IS NULL OR aplic_ug ~ '^[0-9]{7}$');

-- ---------- Anti-duplicação nas tabelas de movimento ----------
-- Chave natural por escopo (tenant + exercício + competência) + nº do documento.
-- competencia pode ser NULL em cargas anuais; nesse caso o NULL distinto do
-- Postgres não colide (esperado — módulos anuais não usam estas tabelas).
CREATE UNIQUE INDEX IF NOT EXISTS aplic_empenho_uk
  ON aplic_empenho (tenant_id, exercicio, competencia, emp_numero);

CREATE UNIQUE INDEX IF NOT EXISTS aplic_liquidacao_uk
  ON aplic_liquidacao (tenant_id, exercicio, competencia, emp_numero, liq_numero);

CREATE UNIQUE INDEX IF NOT EXISTS aplic_pagamento_uk
  ON aplic_pagamento (tenant_id, exercicio, competencia, pgto_numero);

CREATE UNIQUE INDEX IF NOT EXISTS aplic_pagamento_liquidacao_uk
  ON aplic_pagamento_liquidacao (tenant_id, exercicio, competencia, emp_numero, liq_numero, pgto_numero);
