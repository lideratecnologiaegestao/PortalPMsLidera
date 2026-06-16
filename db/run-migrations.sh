#!/bin/sh
set -e
cd /portal-db
for f in 0*.sql; do
  echo ">> $f"
  psql -U postgres -d portal -v ON_ERROR_STOP=1 -q -f "$f"
done
echo MIGRATIONS_OK
