# ADR-0005 — Gestão de Usuários e Controle de Acesso Multi-camada

- **Status:** Aceito
- **Data:** 2026-06-15
- **Migrations:** db/064_roles_novos.sql, db/065_ouvidoria_rls_papel.sql, db/068_ouvidoria_public_guc.sql, db/069_elevation_requests.sql, db/070_eula_aceites.sql
- **Risco tratado:** CRÍTICO — vetor ATIVO de vazamento de dados sigilosos de ouvidoria

## Contexto

Ouvidoria/e-SIC (Lei 13.460/2017 + LAI) tratam **denúncias anônimas** que podem acusar o próprio administrador da entidade. O sigilo da fonte é garantia constitucional (art. 5º, XIV) + LGPD (art. 46). Auditoria do código achou **4 vetores ativos** em que o `admin_prefeitura` (e às vezes gestor/servidor) acessa TUDO da ouvidoria:
1. `manifestacoes-admin.controller.ts:36` — `@Roles(..., ADMIN_PREFEITURA)`.
2. `permissions.catalog.ts:68` — `admin_prefeitura: [WILDCARD]` engloba `ouvidoria.gerenciar`.
3. `atendimento-admin.controller.ts:32` — mesmo padrão.
4. RLS das tabelas de ouvidoria usa `app_enable_tenant_rls()` padrão (isola por tenant, **não por papel**) → a 2ª camada (Regra Inviolável #1) está ausente.

## Decisão

### Papéis (estende `user_role` / `Role`)
`super_admin` · `admin_prefeitura` (SEM ouvidoria) · **`ti`** (acesso total MENOS ouvidoria) · `gestor` (conteúdo da secretaria) · **`ouvidor`** · **`assistente_ouvidoria`** (= ouvidor + exige EULA) · `servidor` (escopo da lotação) · `cidadao`.

**Regra:** `ouvidor`, `assistente_ouvidoria` e `ti` são criados/elevados **SOMENTE pelo super_admin (Lidera) via Gerenciador `/_platform`** — nunca pelo painel da entidade.

### Isolamento da ouvidoria (DUAS camadas)
- **RBAC:** só `ouvidor` + `assistente_ouvidoria` em `@Roles` dos controllers de manifestações/e-SIC. `admin_prefeitura`/`ti`/`gestor` removidos. Wildcard do admin substituído por lista explícita SEM `ouvidoria.gerenciar`/`esic.gerenciar`.
- **RLS por papel (nova):** novos GUCs `app.current_user_role`, `app.current_user_id`, `app.current_secretaria_id` injetados pelo `PrismaService` por transação. Policy nas tabelas `manifestacoes`/`manifestacao_*`/`pesquisa_satisfacao`: visível só se papel ∈ (ouvidor, assistente_ouvidoria) — ou, opcionalmente, `servidor` apenas quando `responsavel_id = usuário` (manifestação EXPLICITAMENTE encaminhada a ele; nunca o inbox, nunca denúncia sigilosa). Defesa em profundidade: mesmo bug no RBAC não vaza.

### Matriz (resumo) — ninguém além de ouvidor/assistente toca ouvidoria/e-SIC
| Recurso | super_admin | admin_pref | ti | gestor | ouvidor | assist | servidor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Ouvidoria + e-SIC | ✓ | — | — | — | ✓ | ✓ | só-atribuído |
| Notícias/Docs/Galeria | ✓ | ✓ | ✓ | escopo | — | — | escopo |
| Transparência/Tema/Config/Usuários | ✓ | ✓ | ✓ | — | — | — | — |
| Criar/elevar ouvidor/assistente/ti | ✓ | — | — | — | — | — | — |
| Criar/elevar gestor/servidor | ✓ | ✓ | — | secret. | — | — | — |
| Painel TV ouvidoria | ✓ | — | — | — | ✓ | ✓ | — |

### Autocadastro + solicitação de elevação
Todos se autocadastram (papel `cidadao`). Servidor **solicita elevação** declarando **cargo + perfil + lotação (secretaria)** → `elevation_requests` (FSM: pendente→aprovada/recusada/expirada). **Autoridade de aprovação:** ouvidor/assistente/ti = super_admin (Gerenciador); gestor/servidor = admin_prefeitura/gestor (painel admin). Ao aprovar: seta `users.role` + `users.secretaria_id`.

### EULA / termo de sigilo
`ouvidor`/`assistente_ouvidoria` aceitam EULA no 1º login (gate no auth) → `eula_aceites` (user+versão+data+IP). Versão muda → reaceite.

### Escopo por secretaria
Servidor com `secretaria_id` vê/edita só o conteúdo da sua secretaria (reusa `escopoSecretaria()` já existente em manifestações; estender p/ notícias/docs/galeria/formulários).

### Painel exclusivo do ouvidor
`/admin/ouvidoria` (só ouvidor/assistente): dashboard KPIs, gráficos (SLA/satisfação), link TV/kiosk, manifestações + e-SIC + relatórios. Menu de ouvidoria some do `/admin` para os demais papéis.

## Fases
1. **Isolar a ouvidoria (CRÍTICO, já):** migrations de papéis + RLS-por-papel; GUCs no PrismaService; corrigir @Roles + permissions; super_admin cria ouvidor via Gerenciador; frontend esconde menu. Teste RLS: admin_prefeitura → 0 linhas de manifestações.
2. **Autocadastro + elevação:** `elevation_requests`, fluxo + telas de solicitação/aprovação (admin e Gerenciador), worker de expiração.
3. **Painel do ouvidor + EULA:** `/admin/ouvidoria` exclusivo + gate de EULA.
4. **Escopo de conteúdo por secretaria** nos demais módulos.

## Consequências
+ Isolamento real (RBAC+RLS) — mandatório legal; corrige o vetor ativo. EULA = base legal documentada (accountability). − Deploy da policy RLS + GUCs do PrismaService deve ser ATÔMICO (mesma janela), senão ninguém vê manifestações. Onde não há ouvidor, só super_admin acessa → criar ouvidor no onboarding. +0,1–0,5ms/tx pelos GUCs (aceitável).

## LGPD
Base legal art. 7º III + 11 II b (dado sensível, proteção). Minimização: admin/ti fora da ouvidoria. Auditoria de acesso a manifestação (`MANIFESTACAO_ACESSADA`). Não isolar = risco art. 48 (incidente) + responsabilidade da Lidera como operadora (art. 42).
