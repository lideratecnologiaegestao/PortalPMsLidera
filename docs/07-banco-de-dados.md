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
| `manifestacoes` | ESIC + Ouvidoria | sim (RLS papel) | protocolo, prazo, status, prorrogação |
| `manifestacao_eventos` | Histórico imutável | sim (RLS papel) | comprova SLA |
| `manifestacao_anexos` | Anexos | sim (RLS papel) | chave de storage |
| `manifestacao_mensagens` | Chat cidadão ↔ ouvidor ↔ área | sim (RLS papel) | `interno=true` oculta ao cidadão |
| `pesquisa_satisfacao` | Avaliação pós-conclusão (Lei 13.460) | sim (RLS papel) | 1 por manifestação |
| `chamados` | App cidadão (geo) | sim | `geography(Point,4326)` + GIST |
| `chamado_fotos` / `chamado_atualizacoes` | Mídia e histórico | sim | |
| `servicos` | Carta de Serviços ao Cidadão (Lei 13.460/2017) | sim | slug `citext` único por tenant; etapas em `jsonb`; índices em `(tenant_id, publicado)` e `(tenant_id, categoria)` |
| `tenant_app_config` | Configuração white-label do App do Cidadão por tenant (ADR-0006 Fase 1) | sim | 1 linha por tenant (`UNIQUE tenant_id`); divide-se em build-time (identidade EAS, assets de storage) e runtime (tema, módulos, onboarding, acesso rápido, categorias de chamados, flags push/biometria). Sem PII; base legal LGPD art. 7º III. Índice em `(tenant_id)`. |
| `tenant_app_builds` | Histórico de builds EAS por tenant (ADR-0006 — Fase 2 usa, criada na Fase 1) | sim | FSM `enfileirado→preparando→em_build→concluido\|falhou`; referencia `users.id` (ON DELETE SET NULL) para trilha de auditoria. `erro_resumo` sanitizado (sem segredos). Índice composto `(tenant_id, criado_em DESC)` + índice parcial `(tenant_id, status)` para builds ativos. |

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

### RLS por papel — módulo de Ouvidoria (ADR-0005 Fase 1, migrations 064-065)

As tabelas de ouvidoria recebem uma segunda camada de isolamento além do `tenant_id`: restrição por papel (`app.current_user_role`). Leitura, atualização e exclusão exigem papel `ouvidor` ou `assistente_ouvidoria`. A abertura de manifestação (INSERT) e o envio de mensagem pelo cidadão (INSERT) continuam liberados para qualquer sessão autenticada no tenant — a restrição recai só sobre leitura/tramitação.

Funções auxiliares de contexto adicionadas na migration 065:
- `app_current_user_role()` — texto do GUC `app.current_user_role`
- `app_current_user_id()` — uuid do GUC `app.current_user_id`
- `app_current_secretaria_id()` — uuid do GUC `app.current_secretaria_id`

Tabelas afetadas e suas policies:

| Tabela | Policy INSERT | Policy SELECT/UPDATE/DELETE |
|--------|---------------|------------------------------|
| `manifestacoes` | `ouvidoria_insert`: tenant correto | `ouvidoria_isolation/update/delete`: tenant + role in (ouvidor, assistente_ouvidoria) |
| `manifestacao_eventos` | idem | idem |
| `manifestacao_anexos` | idem (cidadão faz upload) | idem |
| `manifestacao_mensagens` | idem (cidadão envia msg) | idem |
| `pesquisa_satisfacao` | idem (cidadão avalia) | idem |

Resultado: `admin_prefeitura`, `ti`, `servidor`, `gestor` e sessão sem papel recebem **0 linhas** em qualquer SELECT sobre essas tabelas. A plataforma (modo `app.is_platform = 'on'`) mantém acesso total para jobs e workers cross-tenant.

Novos valores no enum `user_role` (migration 064):
- `assistente_ouvidoria` — apoio na ouvidoria, sem acesso administrativo ao tenant
- `ti` — TI interno; explicitamente excluído da visão de ouvidoria (separação de deveres, art. 10 §3º LAI)

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
