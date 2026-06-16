#!/usr/bin/env bash
# =====================================================================
# Backup offsite diário do MinIO (ADR-0001 — DR básico). Espelha todos os
# buckets do portal para um destino externo (S3/R2/outro MinIO). Agendar via
# cron no servidor Lidera. Restore: inverter origem/destino do `mc mirror`.
#
# Variáveis: MC_ALIAS (origem, default 'portal'), MC_DEST (alias de destino).
# =====================================================================
set -euo pipefail

ALIAS="${MC_ALIAS:-portal}"
DEST="${MC_DEST:?defina MC_DEST (alias do destino de backup)}"
DATA="$(date +%F)"

for bucket in portal-diario portal-manifestacoes portal-chamados portal-cms; do
  echo ">> Espelhando ${bucket} → ${DEST}/${bucket}-backup ..."
  mc mirror --overwrite --remove "${ALIAS}/${bucket}" "${DEST}/${bucket}-backup"
done

echo ">> Backup ${DATA} concluído."
