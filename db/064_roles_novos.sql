-- =====================================================================
-- 064 — Novos valores no enum user_role
-- =====================================================================
-- Adiciona dois papéis que serão utilizados pelo módulo de Ouvidoria
-- com isolamento por papel (ADR-0005, Fase 1):
--
--   assistente_ouvidoria  → servidor de apoio que pode ler e tramitar
--                           manifestações mas NÃO tem acesso administrativo
--                           ao tenant (sem acesso a dados financeiros, LGPD,
--                           gestão de usuários etc.).
--
--   ti                    → técnico de TI interno da prefeitura; tem acesso
--                           a configurações técnicas mas é explicitamente
--                           excluído das visões de Ouvidoria/ESIC para
--                           separação de deveres (art. 10 §3º LAI).
--
-- IMPORTANTE: ALTER TYPE ADD VALUE não é transacional no PostgreSQL —
-- o novo valor não pode ser usado na MESMA transação em que é criado.
-- As policies que referenciam esses valores ficam na migration 065.
-- Cada ADD VALUE está em statement separado conforme exige o Postgres.
-- =====================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'assistente_ouvidoria';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ti';
