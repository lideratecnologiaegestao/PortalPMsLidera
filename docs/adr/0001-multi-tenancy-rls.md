# ADR 0001 — Multi-tenancy por shared schema + RLS

- **Status:** Aceito
- **Data:** 2026-01
- **Decisores:** Arquitetura

## Contexto

A plataforma serve muitas prefeituras a partir de um código único. Precisamos de isolamento forte de dados entre tenants, custo operacional baixo para municípios pequenos/médios (a maioria) e caminho de crescimento para capitais.

## Decisão

Adotar **shared schema + coluna `tenant_id` + PostgreSQL Row Level Security (RLS)** como padrão. A aplicação define `app.current_tenant_id` por transação (via `set_config`, `is_local = true`), e as policies isolam os dados no banco. Tenants de grande porte podem ser promovidos a **schema/banco dedicado** sem alterar a aplicação (mesma camada Prisma e mesmas policies).

## Consequências

**Positivas**
- Isolamento garantido no banco, resiliente a bugs de aplicação.
- Baixo custo por tenant; operação simples para a maioria.
- Caminho de escala (dedicado) sem reescrever a aplicação.

**Negativas / mitigação**
- Cada query vira transação curta (GUC local) → custo extra. *Mitigação:* cache/ISR no read-heavy público.
- RLS exige disciplina (toda tabela de tenant precisa de policy). *Mitigação:* helper `app_enable_tenant_rls`, skill `multi-tenant-rls`, subagent `dba-postgres-rls` e **teste de isolamento obrigatório**.
- Prisma não expressa RLS. *Mitigação:* RLS no SQL como fonte da verdade; `PrismaService` faz a ponte; `prisma db pull` reflete o schema.

## Alternativas consideradas

1. **Schema por tenant** — melhor isolamento percebido, mas migrações e operação ficam caras com centenas de tenants. Mantido como opção de promoção para capitais.
2. **Banco por tenant** — isolamento máximo e custo/operação máximos. Reservado a casos específicos.
3. **Filtro só na aplicação (sem RLS)** — simples, porém um único bug vaza dados entre prefeituras. Rejeitado por risco inaceitável no setor público.
