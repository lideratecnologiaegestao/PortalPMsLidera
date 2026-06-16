-- =====================================================================
-- 061 — Metadados de extração de texto por OCR nos documentos
-- =====================================================================
-- Propósito: rastrear qual método foi usado para popular `conteudo_extraido`
-- (existente desde a migration 045) em cada documento. O worker de extração
-- de PDF opera em camadas:
--   1. nativo   — pdfjs/pdftotext; texto nativo embutido no PDF
--   2. tesseract — Tesseract.js; OCR de imagem quando nativo retorna vazio
--   3. claude   — API Anthropic Vision; OCR de alta confiança para PDFs
--                 escaneados de baixa qualidade ou formulários complexos
--   4. vazio    — arquivo sem texto recuperável (ex.: PDF corrompido/protegido)
--
-- `ocr_confianca` é preenchida pelo Tesseract/Claude; para extração nativa
-- fica NULL (texto é integral, sem estimativa de confiança).
-- `ocr_paginas` registra quantas páginas foram processadas, útil para
-- detectar PDFs truncados no reprocessamento.
--
-- RLS: a tabela `documentos` já tem Row Level Security habilitado
-- (migration 028 + `SELECT app_enable_tenant_rls('documentos')`).
-- Esta migration apenas adiciona colunas — não é necessário re-habilitar.
--
-- IDEMPOTENTE: usa `ADD COLUMN IF NOT EXISTS` em todas as colunas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novas colunas de rastreabilidade OCR
-- ---------------------------------------------------------------------
ALTER TABLE documentos
  ADD COLUMN IF NOT EXISTS ocr_metodo    text,
  ADD COLUMN IF NOT EXISTS ocr_confianca real,
  ADD COLUMN IF NOT EXISTS ocr_paginas   integer;

-- Restringe os valores permitidos em ocr_metodo de forma idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documentos_ocr_metodo_chk'
  ) THEN
    ALTER TABLE documentos
      ADD CONSTRAINT documentos_ocr_metodo_chk
      CHECK (ocr_metodo IN ('nativo', 'tesseract', 'claude', 'vazio'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documentos_ocr_confianca_chk'
  ) THEN
    ALTER TABLE documentos
      ADD CONSTRAINT documentos_ocr_confianca_chk
      CHECK (ocr_confianca IS NULL OR (ocr_confianca >= 0 AND ocr_confianca <= 100));
  END IF;
END $$;

COMMENT ON COLUMN documentos.ocr_metodo    IS 'Método usado para extrair conteudo_extraido: nativo | tesseract | claude | vazio. NULL = ainda não processado.';
COMMENT ON COLUMN documentos.ocr_confianca IS 'Confiança média do OCR (0..100). NULL para extração nativa (texto integral) ou ainda não processado.';
COMMENT ON COLUMN documentos.ocr_paginas   IS 'Número de páginas processadas pelo worker. NULL = ainda não processado.';

-- ---------------------------------------------------------------------
-- 2. Índice parcial para o backfill localizar documentos sem texto
-- ---------------------------------------------------------------------
-- Aponta para registros escaneados ou pendentes de (re)processamento:
-- conteudo_extraido ausente ou com menos de 50 caracteres (PDFs de imagem
-- que retornaram quase vazio na extração nativa). O worker de backfill
-- percorre este índice em vez de fazer seq scan na tabela inteira.
CREATE INDEX IF NOT EXISTS idx_documentos_sem_texto
  ON documentos (tenant_id)
  WHERE conteudo_extraido IS NULL
     OR length(coalesce(conteudo_extraido, '')) < 50;
