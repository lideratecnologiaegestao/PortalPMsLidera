# Módulo Campanhas — Contrato técnico (Fase 1 / Fundação)

> Documento de trabalho interno que define o **contrato** que migração, backend e frontend
> implementam na Fase 1. A documentação formal (visão geral, ADRs, runbook, a11y/LGPD)
> é gerada à parte em `docs/campanhas/`. Fonte do prompt: `prompts/modulo-campanhas/`.

## Escopo da Fase 1 (Fundação)

Entregar o **motor de campanhas** funcionando ponta a ponta, resolvendo o contexto ativo
por **janela de datas** (sem o scheduler autônomo ainda):

- Migração `084` + RLS + modelos Prisma (3 tabelas).
- Backend: registro de capacidades (schemas Zod-like/class-validator), CRUD admin,
  instalar preset (clona template → campanha do tenant), **resolver** `GET /api/campanhas/ativas`
  com cache Redis + precedência, seeds globais da biblioteca, auditoria.
- Frontend público: consumir o contexto e renderizar tema/faixa/banner/popup + montar
  o **efeito** plugável (`aedes-overlay` e `copa-overlay`).
- Admin mínimo: menu **Campanhas** → Biblioteca (instalar presets) + Minhas campanhas
  (lista + ligar/desligar + editar período/conteúdo básico).

**Fora da Fase 1 (vai para a Fase 2):** scheduler BullMQ autônomo + recorrência/sazonal,
editor avançado + calendário anual, capacidade **broadcast** (push/WhatsApp/e-mail),
gatilho por condição/feed. O resolver da Fase 1 já considera a janela de datas, então a
campanha entra/sai pela data mesmo sem o scheduler; o scheduler da Fase 2 só formaliza as
transições de status + recorrência + disparo autônomo.

---

## 1. Modelo de dados (migration 084)

### `campaign_template` — biblioteca GLOBAL (sem tenant_id)
Padrão "dado de plataforma" (igual `ia_conteudos_global`, migration 079): leitura livre,
escrita só com `app_is_platform()`.

| coluna | tipo | nota |
|---|---|---|
| id | uuid PK `gen_random_uuid()` | |
| key | text UNIQUE | ex.: `dengue`, `outubro-rosa` |
| nome | text NOT NULL | |
| categoria | text NOT NULL | `saude` \| `civico` \| `sazonal` \| `fiscal` \| `ambiental` \| `cultural` \| `administrativo` |
| descricao | text NULL | |
| icone | text NULL | emoji/ícone curto |
| config_default | jsonb NOT NULL DEFAULT `'{}'` | capacidades + params padrão (ver §2) |
| sugestao | jsonb NOT NULL DEFAULT `'{}'` | período/recorrência sugeridos (ver §2.recorrencia) |
| prioridade_sugerida | int NOT NULL DEFAULT 100 | |
| ativo | boolean NOT NULL DEFAULT true | |
| criado_em / atualizado_em | timestamptz DEFAULT now() | trigger em atualizado_em |

RLS: `leitura_global` (SELECT USING true) + `escrita_global` (ALL USING/WITH CHECK `app_is_platform()`).

### `campaign` — instância por TENANT
RLS padrão multi-tenant via `SELECT app_enable_tenant_rls('campaign');`

| coluna | tipo | nota |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid NOT NULL FK tenants ON DELETE CASCADE | |
| template_key | text NULL | null = custom; senão a `key` do template de origem |
| nome | text NOT NULL | |
| status | text NOT NULL DEFAULT `'draft'` | `draft` \| `scheduled` \| `active` \| `paused` \| `ended` \| `archived` |
| starts_at | timestamptz NULL | null = sem limite inferior |
| ends_at | timestamptz NULL | null = sem limite superior |
| recorrencia | jsonb NULL | `{tipo:'none'\|'annual'\|'seasonal'\|'rrule', ...}` (consumido na Fase 2) |
| autonomous | boolean NOT NULL DEFAULT false | (Fase 2) |
| prioridade | int NOT NULL DEFAULT 100 | **maior número = maior precedência** |
| config | jsonb NOT NULL DEFAULT `'{}'` | capacidades habilitadas + overrides (ver §2) |
| criado_por | uuid NULL | users(id) |
| criado_em / atualizado_em | timestamptz DEFAULT now() | trigger em atualizado_em |

Índices: `(tenant_id, status)`, `(tenant_id, starts_at, ends_at)`, `(tenant_id)`.

### `campaign_activation_log` — auditoria de disparos por TENANT
RLS padrão multi-tenant via `app_enable_tenant_rls`.

| coluna | tipo | nota |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid NOT NULL FK tenants ON DELETE CASCADE | |
| campaign_id | uuid NOT NULL FK campaign ON DELETE CASCADE | |
| acao | text NOT NULL | `created` \| `installed` \| `updated` \| `activated` \| `deactivated` \| `scheduled` \| `autostarted` \| `ended` |
| ator | text NOT NULL | `scheduler` ou userId (uuid em texto) |
| detalhes | jsonb NOT NULL DEFAULT `'{}'` | |
| criado_em | timestamptz DEFAULT now() | |

Índice: `(tenant_id, campaign_id)`.

> Além do `campaign_activation_log`, **ações sensíveis também gravam em `audit_log`**
> (regra inviolável 6) via `prisma.db.auditLog.create({ acao:'CAMPANHA_*', entidade:'campaign', ... })`.

### Prisma (`api/prisma/schema.prisma`)
Adicionar 3 models: `CampaignTemplate` (global), `Campaign`, `CampaignActivationLog`.
Convenção do repo: `id String @default(dbgenerated("gen_random_uuid()")) @db.Uuid`,
`@map`/`@@map` snake_case, `@db.Timestamptz(6)`, `tenantId String @map("tenant_id") @db.Uuid`.
`config`/`configDefault`/`sugestao`/`recorrencia`/`detalhes` como `Json`.
Template global é lido via `prisma.db` (policy SELECT livre) e escrito via `prisma.platform()`.

---

## 2. Registro de capacidades — schema do JSON `config`

`config` é um objeto onde cada chave presente habilita uma capacidade. Toda capacidade é
**opcional**; ausência = desabilitada. Validação no backend (na escrita) e renderização
tolerante no front (ignora capacidade malformada, nunca quebra o portal).

```jsonc
{
  // 2.1 TEMA — sobrescreve tokens de cor no período. GUARD DE CONTRASTE WCAG AA.
  "tema": {
    "corPrimaria": "#b5006b",      // hex
    "corPrimariaFg": "#ffffff",    // opcional; se omitido, derivar com contraste AA
    "corDestaque": "#f0a830",
    "corSecundaria": "#...",       // opcional
    "aplicarEm": "todo"            // "todo" | "home"  (default "todo")
  },

  // 2.2 FAIXA (ribbon) — barra superior. Empilha (teto 2).
  "faixa": {
    "mensagem": "texto",
    "link": "https://... | /rota",   // opcional
    "corBg": "#b5006b",
    "corTexto": "#ffffff",
    "dismissivel": true              // default true
  },

  // 2.3 BANNER — referência à biblioteca de mídia. alt OBRIGATÓRIO. Empilha (teto 3).
  "banner": {
    "imagemUrl": "/uploads/...",     // vem do MediaPicker
    "alt": "descrição acessível",    // obrigatório
    "link": "...",                   // opcional
    "posicao": "home_topo"           // "home_topo" | "home_secao" (default home_topo)
  },

  // 2.4 POPUP — modal acessível. 1 por vez (maior prioridade). dismissível + teclado.
  "popup": {
    "titulo": "...",
    "subtitulo": "...",              // opcional
    "descricao": "...",
    "bullets": ["...", "..."],       // opcional, máx 6
    "imagemUrl": "...",              // opcional (biblioteca de mídia)
    "ctaLabel": "Saiba mais",        // opcional
    "ctaUrl": "...",                 // opcional
    "frequencia": "dia",             // "sempre" | "dia" | "sessao" (default "dia")
    "paginaAlvo": "/",               // opcional; default todas
    "reabrirAposDias": 7             // default 7
  },

  // 2.5 PÁGINA DE CAMPANHA — referência ao CMS (slug). auto-despublica no fim (Fase 2).
  "pagina": {
    "slug": "outubro-rosa-2026",
    "autoDespublica": true           // Fase 2 honra no scheduler
  },

  // 2.6 EFEITO INTERATIVO — registro plugável NOMEADO. Empilha (teto 1).
  //     Respeita prefers-reduced-motion + "pular". params variam por efeito.
  "efeito": {
    "nome": "aedes-overlay",         // "aedes-overlay" | "copa-overlay"
    "params": { /* ver §3 */ },
    // Controles de comportamento (nível do efeito, não dos params):
    "paginaAlvo": "/",               // ''/ausente = todas; "/" = só a home; "/rota" = exata + sub-rotas
    "permitirParar": true,           // mostra botão "Parar efeito" ao visitante (default true; a11y)
    "duracaoSegundos": 0             // encerra após N s (0/ausente = enquanto estiver na página)
  },

  // 2.7 SELO / BLOCO (opcional, simples na Fase 1)
  "selo": { "texto": "...", "cor": "#...", "link": "..." }

  // 2.8 BROADCAST — FORA DA FASE 1 (Fase 2). Não implementar agora.
}
```

### `recorrencia` (gravado na Fase 1, consumido na Fase 2)
```jsonc
{ "tipo": "none" }
{ "tipo": "annual" }                                   // rola para o próximo ano ao encerrar
{ "tipo": "seasonal", "inicio": "10-01", "fim": "05-31" } // MM-DD; cruza o ano
```

---

## 3. Params dos efeitos plugáveis

### `aedes-overlay` (porta de `prompts/modulo-campanhas/overlay/reference/AedesCampaignOverlay.tsx`)
Mosquitos voam; hover/toque elimina; 1ª eliminação abre popup. **Adaptar para receber os
params da campanha** (não mais de `site_settings`). `municipioId`+`campanhaId` para escopar
a dispensa em localStorage continuam necessários (derivar do tenant + `campaign.id`).
```jsonc
"params": {
  "quantidadeMosquitos": 5,        // 1..8 (mobile clamp 4)
  "corPrimaria": "#294961",
  "corDestaque": "#f0a830",
  "zIndex": 9000,
  "titulo": "Combate ao Aedes aegypti",
  "subtitulo": "10 minutos contra a dengue",
  "descricao": "...",
  "bullets": ["...", "..."],
  "ctaLabel": "Denunciar foco do mosquito",
  "ctaUrl": "#",
  "reabrirAposDias": 7
}
```

### `copa-overlay` (porta de `prompts/modulo-campanhas/overlay/efeito-copa.html`)
Decorativo (verde-amarelo): bola/bandeirinhas/confete/fitas caindo. `pointer-events:none`,
`aria-hidden`, respeita prefers-reduced-motion, **nunca captura cliques**.
```jsonc
"params": {
  "intensidade": "media",          // "leve" | "media" | "forte"
  "faixa": true,
  "mensagem": "Vai, Brasil! 🇧🇷",
  "bolas": true, "bandeiras": true, "confete": true, "fitas": true,
  "ball": "URL_OPCIONAL",          // troca a bola por tenant
  "flag": "URL_OPCIONAL"
}
```

---

## 4. Endpoints

### Público (resolver) — sem auth, escopo por Host/tenant
`GET /api/campanhas/ativas`
Resposta (contexto já resolvido + precedência aplicada):
```jsonc
{
  "tema": null | { "corPrimaria","corPrimariaFg","corDestaque","corSecundaria","aplicarEm","campaignId" },
  "faixas":  [ { "campaignId","mensagem","link","corBg","corTexto","dismissivel" } ],   // máx 2
  "banners": [ { "campaignId","imagemUrl","alt","link","posicao" } ],                   // máx 3
  "popup":   null | { "campaignId","titulo","subtitulo","descricao","bullets","imagemUrl","ctaLabel","ctaUrl","frequencia","paginaAlvo","reabrirAposDias" },
  "efeitos": [ { "campaignId","nome","params" } ],                                      // máx 1
  "selos":   [ { "campaignId","texto","cor","link" } ],
  "paginas": [ { "campaignId","slug" } ]
}
```
- Cache Redis: `RedisCacheService` key `campanhas:ativas:${tenantId}` TTL 60s.
- Invalida (`cache.del`) em qualquer create/update/toggle/install.

### Admin — `@UseGuards(RolesGuard)` + `@Roles(GESTOR, ADMIN_PREFEITURA)` (SUPER_ADMIN sempre passa)
- `GET    /api/admin/campanhas/biblioteca`            → lista templates globais (presets)
- `POST   /api/admin/campanhas/instalar`              → body `{ templateKey }` → clona p/ tenant (status `draft`, copia config_default + sugestão de datas/prioridade) → retorna a campanha
- `GET    /api/admin/campanhas`                        → lista campanhas do tenant
- `GET    /api/admin/campanhas/:id`                    → detalhe
- `POST   /api/admin/campanhas`                        → cria custom
- `PUT    /api/admin/campanhas/:id`                    → atualiza (nome, datas, prioridade, config, recorrencia)
- `PATCH  /api/admin/campanhas/:id/status`             → body `{ status }` (ligar=`active` / desligar=`paused`)
- `DELETE /api/admin/campanhas/:id`                    → remove (ou archive)
- `POST   /api/admin/campanhas/_semear`                → (super_admin) semeia/atualiza a biblioteca global a partir do catálogo

Toda mutação grava `campaign_activation_log` + `audit_log` e invalida o cache.

---

## 5. Precedência / conflitos (determinístico)
Entre as campanhas **efetivas agora** (status `active` ou `scheduled` **e** `now ∈ [starts_at, ends_at]`,
tratando null como aberto; `paused`/`draft`/`ended`/`archived` ficam de fora):
- **tema:** só **uma** vence — a de **maior `prioridade`** que declara `tema` (empate → mais recente `criado_em`).
- **popup:** **um** só — maior prioridade.
- **efeito:** teto **1** — maior prioridade.
- **faixa:** empilha, teto **2** (ordena por prioridade desc).
- **banner:** empilha, teto **3**.
- **selo:** empilha, teto 3.
- Override manual do admin (status `paused`) sempre vence: campanha pausada nunca aparece.

## 6. Acessibilidade / LGPD (requisitos de aceite)
- Popup: `role="dialog"` `aria-modal`, fecha no Esc/backdrop/X, foco no diálogo ao abrir, frequência limitada.
- Efeitos: respeitam `prefers-reduced-motion` (aedes → banner estático dispensável; copa → não anima) e têm como "pular"; **nunca** bloqueiam cliques nem acesso a serviço essencial.
- Tema: **guard de contraste AA** — se o par cor/texto falhar, ajustar (derivar fg) ou avisar no admin; não salvar tema reprovado (regra inviolável 3).
- LGPD: sem dado pessoal no conteúdo de campanha; auditoria das ativações/edições.
- **Aviso de ano eleitoral** (Lei 9.504/97): exibir alerta no admin; permitir pausar/agendar fora do período vedado; o sistema **não** garante conformidade — responsabilidade do município/jurídico.
