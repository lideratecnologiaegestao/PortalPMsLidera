-- =====================================================================
-- 058 — UG (Unidade Gestora) na carga APLIC
-- =====================================================================
-- Os 7 primeiros dígitos do nome do arquivo (ex.: 1113190CT202601.ZIP) são o
-- código único da entidade no TCE-MT (UG). Guardamos para rastreabilidade e
-- para VALIDAR que a carga pertence à entidade certa (não misturar UGs num tenant).
-- =====================================================================

ALTER TABLE aplic_carga ADD COLUMN IF NOT EXISTS ug text;

COMMENT ON COLUMN aplic_carga.ug IS 'Unidade Gestora (TCE-MT): 7 primeiros dígitos do nome do arquivo da carga.';
