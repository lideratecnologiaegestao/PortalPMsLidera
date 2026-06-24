# Catálogo de Presets — Seeds da Biblioteca

Fonte: `api/src/modules/campanhas/seeds/biblioteca.ts` — constante `BIBLIOTECA_PRESETS`.

Total: **28 presets** divididos em quatro grupos.

---

## Como semear

Execute uma vez por ambiente (e a cada atualização do catálogo):

```bash
# Via API (requer usuário super_admin autenticado)
curl -X POST https://<host>/api/admin/campanhas/_semear \
  -H "Authorization: Bearer <token>"

# Ou via painel admin: /admin/campanhas → botão "Semear biblioteca" (visível apenas para super_admin)
```

A operação é idempotente: faz upsert por `key`. Retorna `{ criados: N, atualizados: M }`.

Auditoria: grava em `audit_log` com `acao = 'CAMPANHA_SEMEAR_BIBLIOTECA'`, `entidade = 'campaign_template'`.

---

## Grupo 1 — Efeitos especiais

| Key | Nome | Capacidades padrão | Recorrência sugerida | Prioridade |
|-----|------|--------------------|---------------------|------------|
| `dengue` | Combate à Dengue / Aedes aegypti | `efeito:aedes-overlay` + `popup` + `faixa` (vermelho) | `seasonal 10-01→05-31` | 200 |
| `copa` | Copa do Mundo / Jogos do Brasil | `efeito:copa-overlay` + `faixa` (verde-amarelo) | `none` (datas manuais) | 150 |

---

## Grupo 2 — Meses coloridos prioritários (tema + faixa + popup)

| Key | Nome | Cor | Período sugerido | Prioridade |
|-----|------|-----|-----------------|------------|
| `setembro-amarelo` | Setembro Amarelo — Prevenção ao Suicídio | `#f5c518` | 01/09–30/09 (annual) | 300 |
| `outubro-rosa` | Outubro Rosa — Câncer de Mama | `#e91e8c` | 01/10–31/10 (annual) | 300 |
| `novembro-azul` | Novembro Azul — Saúde do Homem | `#1565c0` | 01/11–30/11 (annual) | 300 |

---

## Grupo 3 — Meses coloridos com tema + faixa (annual)

| Key | Nome | Cor | Período sugerido | Prioridade |
|-----|------|-----|-----------------|------------|
| `janeiro-branco` | Janeiro Branco — Saúde Mental | `#f0f0f0` (fg `#222`) | 01/01–31/01 | 100 |
| `fevereiro-roxo` | Fevereiro Roxo — Lúpus, Alzheimer, Fibromialgia | `#6a1b9a` | 01/02–28/02 | 100 |
| `marco-lilas` | Março Lilás — Câncer de Colo do Útero | `#ab47bc` | 01/03–31/03 | 100 |
| `abril-azul` | Abril Azul — Autismo | `#0288d1` | 01/04–30/04 | 100 |
| `maio-amarelo` | Maio Amarelo — Segurança no Trânsito | `#fdd835` | 01/05–31/05 | 150 |
| `maio-laranja` | Maio Laranja — Enfrentamento ao Abuso Sexual Infantil | `#e65100` | 01/05–31/05 | 180 |
| `junho-vermelho` | Junho Vermelho — Doação de Sangue | `#c62828` | 01/06–30/06 | 100 |
| `junho-violeta` | Junho Violeta — Violência contra Idosos | `#7b1fa2` | 01/06–30/06 | 90 |
| `julho-amarelo` | Julho Amarelo — Hepatites Virais | `#f9a825` | 01/07–31/07 | 100 |
| `agosto-dourado` | Agosto Dourado — Aleitamento Materno | `#f57f17` | 01/08–31/08 | 100 |
| `agosto-lilas` | Agosto Lilás — Lei Maria da Penha | `#9c27b0` | 01/08–31/08 | 200 |
| `novembro-roxo` | Novembro Roxo — Prematuridade | `#6a1b9a` | 01/11–30/11 | 80 |
| `dezembro-vermelho` | Dezembro Vermelho — Luta contra a AIDS | `#b71c1c` | 01/12–31/12 | 100 |

Todos os presets deste grupo têm `recorrencia: { tipo: 'annual' }`. As cores foram validadas para contraste WCAG AA via `deriveFg()` no momento do seed.

---

## Grupo 4 — Sazonais e operacionais

| Key | Nome | Capacidades padrão | Recorrência sugerida | Prioridade |
|-----|------|--------------------|---------------------|------------|
| `iptu` | IPTU — Abertura do Exercício Fiscal | `faixa` (azul) + `pagina:iptu` | `annual 01-02→03-31` | 250 |
| `campanha-agasalho` | Campanha do Agasalho | `banner` + `popup` | `seasonal 05-01→08-31` | 150 |
| `estiagem-queimadas` | Estiagem e Queimadas — Prevenção | `faixa` (laranja) + `popup` | `seasonal 06-01→09-30` | 180 |
| `vacinacao` | Campanha de Vacinação | `banner` + `popup` + `pagina:vacinacao` | `annual` (datas manuais) | 220 |
| `aniversario-cidade` | Aniversário da Cidade | `banner` + `faixa` (roxo) + `selo` | `annual` (data manual) | 100 |

---

## Avisos sobre datas

- **Vacinação** (`vacinacao`): datas definidas a cada ano pelo Ministério da Saúde. O preset tem `recorrencia: annual` mas `starts_at`/`ends_at` ficam em branco — o admin configura manualmente ao instalar.
- **Copa do Mundo** (`copa`): datas dependem do calendário FIFA; `recorrencia: none`. O admin define o período a cada edição.
- **Aniversário da cidade** (`aniversario-cidade`): cada município tem uma data diferente. Ao instalar, o admin define a data correta.
- **Meses coloridos com dois presets no mesmo mês** (ex.: `maio-amarelo` + `maio-laranja`; `junho-vermelho` + `junho-violeta`; `agosto-dourado` + `agosto-lilas`; `novembro-azul` + `novembro-roxo`): a precedência por `prioridade` determina qual tema vence; faixas empilham (teto 2). O admin pode escolher quais instalar.

---

## Notas de customização

Ao instalar um preset, o tenant recebe uma cópia com `status = draft`. Antes de publicar (mudar para `active` ou `scheduled`), recomenda-se:

1. Revisar as cores no editor (confirmar contraste com as cores do portal do município).
2. Ajustar as datas exatas para o ano corrente.
3. Substituir banners placeholder (`/uploads/placeholder-*.jpg`) por imagens reais via MediaPicker.
4. Revisar os textos de popup e faixa para o contexto local.
5. Conferir o link do CTA (ex.: `/ouvidoria`, `/servicos/saude`) — rotas podem diferir entre tenants.
