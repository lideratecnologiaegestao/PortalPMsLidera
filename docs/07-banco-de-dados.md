# 07 — Banco de Dados

PostgreSQL 16 + PostGIS. As migrations em `db/*.sql` são a **fonte da verdade** (inclusive do RLS); o Prisma reflete via `prisma db pull`.

## Convenções

- PKs `uuid` com `gen_random_uuid()`; `citext` para e-mails; timestamps `timestamptz`.
- Toda tabela de tenant: `tenant_id uuid NOT NULL` + `SELECT app_enable_tenant_rls('tabela')`.
- Índices compostos por `tenant_id` + coluna de filtro (status/data); geo via GIST.
- FKs com `ON DELETE` explícito. Migrations ordenadas `NNN_descricao.sql`, nunca editar uma já aplicada.

## Tabelas (fundação atual)

| Tabela | Propósito | RLS | Notas |
|--------|-----------|-----|-------|
| `tenants` | Registro de prefeituras | — (registro) | escrita só por super_admin |
| `audit_log` | Trilha de ações/falhas | sim (aceita tenant NULL) | dead-letter de workers |
| `secretarias` | Estrutura organizacional | sim | |
| `users` | Usuários e papéis | sim | `govbr_sub`, `role`, MFA; unicidade email por tenant |
| `tenant_themes` | Design tokens + WCAG | sim | `wcag_ok` bloqueia save |
| `cms_pages` / `cms_blocks` | CMS dinâmico | sim | blocos = props de componentes |
| `manifestacoes` | ESIC + Ouvidoria | sim | protocolo, prazo, status, prorrogação |
| `manifestacao_eventos` | Histórico imutável | sim | comprova SLA |
| `manifestacao_anexos` | Anexos | sim | chave de storage |
| `chamados` | App cidadão (geo) | sim | `geography(Point,4326)` + GIST |
| `chamado_fotos` / `chamado_atualizacoes` | Mídia e histórico | sim | |
| `servicos` | Carta de Serviços ao Cidadão (Lei 13.460/2017) | sim | slug `citext` único por tenant; etapas em `jsonb`; índices em `(tenant_id, publicado)` e `(tenant_id, categoria)` |

## RLS — como funciona

```sql
-- helper aplicado a cada tabela de tenant
SELECT app_enable_tenant_rls('manifestacoes');
-- equivale a policy:
--   USING (app_is_platform() OR tenant_id = app_current_tenant())
```

A aplicação seta o GUC por transação:
```sql
BEGIN;
SELECT set_config('app.current_tenant_id', '<uuid>', true);
-- queries só enxergam o tenant
COMMIT;
```

## PostGIS (chamados)

- Ponto em `geography(Point,4326)`; índice GIST.
- Duplicados por proximidade: `ST_DWithin(geo, ST_MakePoint(lng,lat)::geography, 30)`.
- Mapa: consulta por bounding box / raio a partir da posição do cidadão.

## Modelos canônicos futuros

- **Transparência:** tabelas `transp_*` (receitas, despesas, licitacoes, contratos, folha) normalizadas a partir do ETL; chave natural por exercício/empenho para idempotência.
- **Diário Oficial:** `diario_edicoes` com hash/assinatura ICP-Brasil e carimbo de tempo; imutável.
- **Serviços:** `servicos` (migration 015) — catálogo implementado.

## Performance

- Cache/ISR à frente do que é público (transparência) para amortizar o custo da transação RLS.
- `EXPLAIN (ANALYZE, BUFFERS)` para diagnóstico; preferir índice a desligar RLS.
- Particionamento por tenant/tempo em tabelas de altíssimo volume (logs, transparência) quando necessário.

## Migração para schema dedicado (capitais)

Tenant grande pode ser promovido a schema próprio: a camada Prisma e as policies seguem iguais; muda só o roteamento de conexão. Decisão por ADR.
