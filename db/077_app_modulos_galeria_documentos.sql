-- 077_app_modulos_galeria_documentos.sql
-- Novos módulos do App do Cidadão: Galeria e Documentos oficiais (ADR-0006).
-- Runtime (liga/desliga no painel, sem rebuild). Aplicar como superusuário postgres.

ALTER TABLE tenant_app_config
  ADD COLUMN IF NOT EXISTS modulo_galeria    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS modulo_documentos boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tenant_app_config.modulo_galeria IS 'Mostra a Galeria (fotos/vídeos) no app';
COMMENT ON COLUMN tenant_app_config.modulo_documentos IS 'Mostra os Documentos oficiais (leis, decretos…) no app';
