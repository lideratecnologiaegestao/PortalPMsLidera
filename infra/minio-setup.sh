#!/usr/bin/env bash
# =====================================================================
# Provisionamento dos buckets MinIO do portal (ADR-0001, item "agora").
# Versionamento (imutabilidade do Diário), retenção por finalidade e
# separação por tipo. Rode UMA vez após subir o portal-minio.
#
# Pré-requisitos: cliente `mc` (MinIO Client) configurado para o alias `portal`.
#   mc alias set portal http://portal-minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
# =====================================================================
set -euo pipefail

ALIAS="${MC_ALIAS:-portal}"

criar() {
  local bucket="$1"
  mc mb --ignore-existing "${ALIAS}/${bucket}"
}

echo ">> Criando buckets..."
criar portal-diario
criar portal-manifestacoes
criar portal-chamados
criar portal-cms

echo ">> Versionamento (Diário e Manifestações = imutabilidade/trilha)..."
mc version enable "${ALIAS}/portal-diario"
mc version enable "${ALIAS}/portal-manifestacoes"

echo ">> Retenção por finalidade (LGPD/DPIA)..."
# Diário Oficial: permanente (apenas versionado, sem expiração).
# Chamados: expira objetos 730 dias após criação (2 anos).
mc ilm rule add "${ALIAS}/portal-chamados" --expire-days 730
# Manifestações: 10 anos (3650 dias).
mc ilm rule add "${ALIAS}/portal-manifestacoes" --expire-days 3650

echo ">> Pronto. Acesso aos objetos SEMPRE via backend (regra 2b) — sem ACL pública."
