---
name: multi-tenant-rls
description: Padrão obrigatório de multi-tenancy com Row Level Security para este projeto. Use SEMPRE que criar tabela nova, escrever query, criar service, worker ou qualquer acesso a dados — para garantir isolamento entre prefeituras. Acione a qualquer menção a tenant, isolamento, nova tabela, migration, query, RLS, ou "dados da prefeitura".
---

# Multi-tenancy com RLS

Isolamento entre prefeituras (tenants) vive no **banco**, não só no código.

## Ao criar uma tabela
1. Inclua `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
2. Habilite RLS:
   ```sql
   SELECT app_enable_tenant_rls('minha_tabela');
   ```
   Isso cria a policy `tenant_isolation` usando `app_current_tenant()` e força RLS inclusive para o dono.
3. Índice composto para os filtros frequentes: `CREATE INDEX ... ON minha_tabela (tenant_id, status);`

## Ao acessar dados (NestJS)
- Use **sempre** `this.prisma.db.*`. O `PrismaService` envolve cada operação numa transação que executa `set_config('app.current_tenant_id', <tenant>, true)`, e as policies isolam automaticamente.
- O `tenant_id` vem do `TenantContext` (AsyncLocalStorage), preenchido pelo `TenantMiddleware` a partir do Host. **Não** passe `tenantId` manualmente nem confie só em `WHERE tenant_id = ...`.
- Cross-tenant (super_admin, registro de tenants, jobs de plataforma): use `this.prisma.platform()` — seta `app.is_platform = on`. Justifique o uso.

## Em workers (BullMQ)
Jobs rodam fora do ciclo HTTP. Abra o contexto manualmente:
```ts
await TenantContext.run({ tenantId: job.data.tenantId }, async () => {
  // queries aqui respeitam o RLS do tenant
});
```

## Teste obrigatório
Toda tabela nova exige teste de isolamento: criar tenant A e B, inserir em cada, provar que A não lê B. Sem esse teste, o PR não passa.

## Armadilhas
- Não desligue RLS para “resolver” performance — otimize com índice.
- `set_config(..., true)` é local à transação (seguro com pool). Por isso cada query vira uma transação curta; para páginas públicas read-heavy, ponha cache (Redis/ISR) por cima.
- `audit_log` aceita `tenant_id NULL` (eventos de plataforma) — a policy já trata isso.
