# Endpoints — Módulo Campanhas

## Endpoint público — Resolver

### `GET /api/campanhas/ativas`

Sem autenticação. O tenant é resolvido pelo `TenantMiddleware` a partir do cabeçalho `Host` da requisição.

**Quando usar:** o portal público chama este endpoint no SSR/ISR para montar o contexto de campanha antes de renderizar cada página.

**Cache:** Redis, chave `campanhas:ativas:<tenantId>`, TTL 60 segundos. Toda mutação (admin) invalida imediatamente.

**Resposta 200:**

```jsonc
{
  "tema": null | {
    "campaignId":    "uuid",
    "corPrimaria":   "#b5006b",
    "corPrimariaFg": "#ffffff",
    "corDestaque":   "#f0a830",
    "corSecundaria": "#...",          // opcional
    "aplicarEm":     "todo"
  },

  "faixas": [                         // máx. 2, ordem de prioridade desc
    {
      "campaignId":  "uuid",
      "mensagem":    "texto",
      "link":        "https://...",   // opcional
      "corBg":       "#b5006b",       // opcional
      "corTexto":    "#ffffff",       // opcional
      "dismissivel": true
    }
  ],

  "banners": [                        // máx. 3
    {
      "campaignId": "uuid",
      "imagemUrl":  "/uploads/...",
      "alt":        "descrição",
      "link":       "...",            // opcional
      "posicao":    "home_topo"
    }
  ],

  "popup": null | {
    "campaignId":      "uuid",
    "titulo":          "...",
    "subtitulo":       "...",         // opcional
    "descricao":       "...",
    "bullets":         ["...", "..."],// opcional
    "imagemUrl":       "...",         // opcional
    "ctaLabel":        "...",         // opcional
    "ctaUrl":          "...",         // opcional
    "frequencia":      "dia",
    "paginaAlvo":      "/",           // opcional
    "reabrirAposDias": 7
  },

  "efeitos": [                        // máx. 1
    {
      "campaignId": "uuid",
      "nome":       "aedes-overlay",
      "params":     { /* ver capacidades.md §2.6 */ }
    }
  ],

  "selos": [                          // máx. 3
    {
      "campaignId": "uuid",
      "texto":      "🎂 Aniversário",
      "cor":        "#7b1fa2",        // opcional
      "link":       "..."             // opcional
    }
  ],

  "paginas": [                        // sem teto explícito
    {
      "campaignId": "uuid",
      "slug":       "outubro-rosa-2026"
    }
  ]
}
```

**Precedência aplicada pelo resolver:**

| Capacidade | Regra | Teto |
|------------|-------|------|
| `tema` | 1 vencedor — maior `prioridade`; empate por `criado_em DESC` | 1 |
| `popup` | 1 vencedor — maior `prioridade` | 1 |
| `efeito` | 1 vencedor — maior `prioridade` | 1 |
| `faixa` | Empilha por prioridade desc | 2 |
| `banner` | Empilha por prioridade desc | 3 |
| `selo` | Empilha por prioridade desc | 3 |
| `pagina` | Todas incluídas | sem teto |

**Campanhas consideradas:** status `active` ou `scheduled` **e** `now ∈ [starts_at, ends_at]` (null = aberto). Status `paused`, `draft`, `ended`, `archived` nunca aparecem. Admin que pausa uma campanha a remove imediatamente do contexto (invalida o cache).

---

## Endpoints admin

Base: `/api/admin/campanhas`

Autenticação: `JwtAuthGuard` + `RolesGuard`. Roles permitidos: `GESTOR`, `ADMIN_PREFEITURA`, `SUPER_ADMIN`. Toda mutação grava em `campaign_activation_log` e `audit_log`, e invalida o cache Redis do tenant.

### `GET /api/admin/campanhas/biblioteca`

Lista todos os templates globais com `ativo = true`. Ordenados por `categoria asc, nome asc`.

**Resposta 200:** array de `CampaignTemplate` (id, key, nome, categoria, descricao, icone, configDefault, sugestao, prioridadeSugerida).

---

### `POST /api/admin/campanhas/instalar`

Clona um template para o tenant. A campanha é criada com status `draft`, `config` copiado de `configDefault`, `starts_at`/`ends_at` derivados de `sugestao` (formato `MM-DD` resolvido para o ano corrente; se a data já passou, avança um ano), `prioridade` de `sugestao.prioridade ?? prioridadeSugerida`, `recorrencia` de `sugestao.recorrencia`.

**Body:**
```json
{ "templateKey": "dengue" }
```

**Resposta 201:** a campanha criada. Após instalar, o painel admin abre o editor automaticamente para o admin revisar e personalizar antes de publicar.

**Erro 404** se `templateKey` não existir na biblioteca.

---

### `GET /api/admin/campanhas`

Lista todas as campanhas do tenant. Ordenadas por `prioridade desc, criado_em desc`.

**Resposta 200:** array de `Campaign`.

---

### `GET /api/admin/campanhas/:id`

Detalhe de uma campanha.

**Resposta 200:** `Campaign` completo.
**Erro 404** se não encontrado.

---

### `POST /api/admin/campanhas`

Cria campanha custom (sem preset).

**Body:**
```jsonc
{
  "nome":       "Minha Campanha",    // obrigatório
  "startsAt":   "2026-10-01T00:00", // ISO 8601; null = sem limite
  "endsAt":     "2026-10-31T23:59",
  "prioridade": 150,                 // default 100
  "config": {                        // ver capacidades.md
    "faixa": { "mensagem": "...", "corBg": "#...", "corTexto": "#..." }
  },
  "recorrencia": { "tipo": "annual" } // null | { tipo, inicio?, fim? }
}
```

**Resposta 201:** campanha criada com `status = "draft"`.

O backend valida o `config` via `validarConfig()` — inclui guard WCAG AA para `tema`. Erros retornam 400 com mensagem legível.

---

### `PUT /api/admin/campanhas/:id`

Atualiza campos da campanha. Todos os campos são opcionais (patch semântico com substituição total via PUT).

**Body:** mesmo schema do POST (todos opcionais).

**Resposta 200:** campanha atualizada.

---

### `PATCH /api/admin/campanhas/:id/status`

Altera o status da campanha. Usado para ligar (`active`), desligar (`paused`) e encerrar (`ended`).

**Body:**
```json
{ "status": "active" }
```

Valores válidos: `draft`, `scheduled`, `active`, `paused`, `ended`, `archived`.

**Resposta 200:** campanha atualizada.

---

### `DELETE /api/admin/campanhas/:id`

Remove a campanha. O `campaign_activation_log` é removido em cascata. O `audit_log` preserva o registro da exclusão.

**Resposta 200:** `{ "excluido": true }`.

---

### `POST /api/admin/campanhas/_semear`

Semeia ou atualiza a biblioteca global de presets a partir de `BIBLIOTECA_PRESETS` em `seeds/biblioteca.ts`. Idempotente: upsert por `key`. Requer role `SUPER_ADMIN`.

**Resposta 200:**
```json
{ "criados": 3, "atualizados": 25 }
```

**Quando executar:** na primeira instalação da plataforma e toda vez que a Lidera atualizar o catálogo de presets.

---

## Cache e invalidação

A chave Redis `campanhas:ativas:<tenantId>` com TTL 60s é criada pelo resolver e apagada via `cache.del()` em toda mutação admin:

| Ação | Invalida? |
|------|-----------|
| `POST /instalar` | sim |
| `POST /` (criar) | sim |
| `PUT /:id` | sim |
| `PATCH /:id/status` | sim |
| `DELETE /:id` | sim |
| `POST /_semear` | não (templates globais não pertencem a um tenant) |

O resolver do frontend deve sempre buscar o contexto fresco ao carregar a página (no-store ou revalidação curta no Next.js) para garantir que o cache Redis seja o único ponto de latência.
