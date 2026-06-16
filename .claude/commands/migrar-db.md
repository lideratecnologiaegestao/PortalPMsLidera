---
description: Cria e valida uma migration de banco com RLS
argument-hint: <descrição da mudança de schema>
---

Atue como `dba-postgres-rls` para: **$ARGUMENTS**

1. Crie a migration em `db/NNN_descricao.sql` (não edite migrations já aplicadas).
2. Toda tabela com dados de tenant recebe `tenant_id` + `SELECT app_enable_tenant_rls('tabela');` e índices por `tenant_id`.
3. Aplique no Postgres do Docker e **prove o isolamento RLS** com dois tenants.
4. `prisma db pull` + `prisma generate`; confira o schema.
5. Atualize `docs/07-banco-de-dados.md`.
6. Mostre o diff e o resultado do teste de isolamento antes de concluir.
