#!/bin/sh
set -e
cd /portal-db
# Nomes têm 3 dígitos zero-padded (001..101), então a ordem lexicográfica de
# *.sql é a ordem correta. NÃO usar 0*.sql (pularia as migrations 1xx).
for f in [0-9]*.sql; do
  echo ">> $f"
  psql -U postgres -d portal -v ON_ERROR_STOP=1 -q -f "$f"
done
echo MIGRATIONS_OK
