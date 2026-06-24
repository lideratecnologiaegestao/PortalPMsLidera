# Capacidades — Módulo Campanhas

Uma capacidade é uma "peça" que uma campanha pode ligar. O objeto `config` de uma campanha é um mapa onde cada chave presente habilita a capacidade correspondente. Ausência da chave = desabilitada. Capacidades desconhecidas ou malformadas são ignoradas silenciosamente no frontend (renderização tolerante); no backend, a escrita lança `BadRequestException` com mensagem legível.

Validação: `api/src/modules/campanhas/capabilities/validator.ts` — função `validarConfig(raw)`.

---

## 2.1 `tema` — override de cores do portal

Sobrescreve os tokens de cor do tema do tenant durante a vigência da campanha. Injetado como CSS vars em `:root` pelo `CampanhaRenderer`.

```jsonc
"tema": {
  "corPrimaria":   "#b5006b",     // obrigatório; hex #rgb ou #rrggbb
  "corPrimariaFg": "#ffffff",     // opcional; se omitido, derivado automaticamente
  "corDestaque":   "#f0a830",     // opcional
  "corSecundaria": "#...",        // opcional
  "aplicarEm":     "todo"         // "todo" | "home"  (default "todo")
}
```

**Guard de contraste WCAG AA (regra inviolável 3):** ao salvar, o par `corPrimaria`/`corPrimariaFg` é validado para razão de contraste >= 4.5:1 (WCAG 2.1 §1.4.3). Se `corPrimariaFg` for omitido, o sistema deriva automaticamente `#ffffff` ou `#000000`, o que tiver maior contraste — nunca rejeita por omissão. Se `corPrimariaFg` for informado e reprovar, a requisição falha com mensagem clara indicando a razão obtida.

Implementação: `api/src/modules/campanhas/capabilities/wcag.ts` — funções `relativeLuminance`, `contrastRatio`, `deriveFg`, `validarContrasteWcagAA`.

---

## 2.2 `faixa` — barra superior (ribbon)

Barra fixada no topo da página com mensagem e botão de dispensa. Empilha até teto 2 (campanhas de maior prioridade primeiro).

```jsonc
"faixa": {
  "mensagem":   "texto",             // obrigatório
  "link":       "https://...",       // opcional; abre na href do texto
  "corBg":      "#b5006b",           // opcional; hex
  "corTexto":   "#ffffff",           // opcional; hex
  "dismissivel": true                // default true
}
```

Componente: `web/components/campanhas/CampanhaFaixa.tsx`. Dispensa persiste em `localStorage` escopado por `tenantHost:campaignId`. Esc também dispensa quando `dismissivel: true`. z-index 7800 (abaixo do cookie consent e dos modais).

---

## 2.3 `banner` — imagem de campanha

Imagem com alt obrigatório e link opcional. Empilha até teto 3 por posição.

```jsonc
"banner": {
  "imagemUrl": "/uploads/...",       // obrigatório; URL da biblioteca de mídia
  "alt":       "descrição",          // obrigatório (acessibilidade)
  "link":      "...",                // opcional
  "posicao":   "home_topo"           // "home_topo" | "home_secao"  (default home_topo)
}
```

Componente: `web/components/campanhas/CampanhaBanner.tsx`. Imagens chegam sempre via API multipart (biblioteca de mídia) — nunca URL externa enviada diretamente pelo frontend.

---

## 2.4 `popup` — modal acessível com frequência controlada

Modal com conteúdo informativo. Apenas 1 popup exibido por vez (maior prioridade vence). Frequência e página-alvo controladas no frontend via `localStorage` / `sessionStorage`.

```jsonc
"popup": {
  "titulo":        "...",            // obrigatório
  "subtitulo":     "...",            // opcional
  "descricao":     "...",            // obrigatório
  "bullets":       ["...", "..."],   // opcional; máx. 6 itens
  "imagemUrl":     "...",            // opcional; biblioteca de mídia
  "ctaLabel":      "Saiba mais",     // opcional
  "ctaUrl":        "...",            // opcional
  "frequencia":    "dia",            // "sempre" | "dia" | "sessao"  (default "dia")
  "paginaAlvo":    "/",              // opcional; só exibe nesta rota
  "reabrirAposDias": 7               // default 7; dias até reaparecer (freq "dia")
}
```

Componente: `web/components/campanhas/CampanhaPopup.tsx`. ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, foco gerenciado ao abrir (`dialogRef.focus()`), fecha com Esc / clique no backdrop / botão X. z-index 8000.

---

## 2.5 `pagina` — referência a página CMS

Associa a campanha a uma página CMS (slug). Útil para landing pages de campanhas publicadas durante o período. `autoDespublica` é honrado pelo scheduler autônomo na Fase 2.

```jsonc
"pagina": {
  "slug":          "outubro-rosa-2026",
  "autoDespublica": true              // Fase 2 despublica a página ao encerrar
}
```

---

## 2.6 `efeito` — efeito interativo plugável

Componente React dinâmico montado a partir do `nome` via `EFEITOS_REGISTRY`. Teto 1 por tenant (maior prioridade vence). Todos os efeitos respeitam `prefers-reduced-motion` e têm opção de "pular". Nunca capturam cliques essenciais nem bloqueiam acesso a serviços.

```jsonc
"efeito": {
  "nome":   "aedes-overlay",         // nome registrado no registry
  "params": { /* ver abaixo */ }
}
```

Registry: `web/components/campanhas/efeitos/registry.ts` — `EFEITOS_REGISTRY: Record<string, ComponentType<EfeitoProps>>`.

### Efeito `aedes-overlay`

Mosquitos animados voam pela tela; hover/toque elimina; a 1ª eliminação abre popup informativo sobre dengue. Com `prefers-reduced-motion`: exibe banner estático dispensável em vez da animação.

```jsonc
"params": {
  "quantidadeMosquitos": 5,          // 1..8 (mobile: clamp 4); default 5
  "corPrimaria":   "#294961",        // cor do popup; hex opcional
  "corDestaque":   "#f0a830",        // destaque do popup; hex opcional
  "zIndex":        9000,             // default 9000
  "titulo":        "Combate ao Aedes aegypti",
  "subtitulo":     "10 minutos contra a dengue",
  "descricao":     "...",
  "bullets":       ["...", "..."],
  "ctaLabel":      "Denunciar foco do mosquito",
  "ctaUrl":        "#",
  "reabrirAposDias": 7               // dias até o efeito reaparecer; default 7
}
```

Dispensa: `localStorage` escopado por `campanha-aedes:<tenantHost>:<campaignId>` com TTL em milissegundos.

### Efeito `copa-overlay`

Overlay decorativo verde-amarelo: bola, bandeirinhas, confete e fitas caindo via Canvas 2D. `pointer-events:none` em todo o contêiner — nunca captura cliques. `aria-hidden="true"` no contêiner. Com `prefers-reduced-motion`: canvas limpo, sem animação.

```jsonc
"params": {
  "intensidade":  "media",           // "leve" | "media" | "forte"; default "media"
  "faixa":        true,              // exibe faixa inferior com mensagem; default true
  "mensagem":     "Vai, Brasil! 🇧🇷",
  "bolas":        true,
  "bandeiras":    true,
  "confete":      true,
  "fitas":        true,
  "ball":         "URL_OPCIONAL",    // substitui a bola padrão por imagem do tenant
  "flag":         "URL_OPCIONAL"     // substitui a bandeirinha padrão
}
```

Validação no backend: `params.intensidade` deve ser `"leve"`, `"media"` ou `"forte"` quando presente. Demais campos são booleanos/strings livres sem validação rígida.

---

## 2.7 `selo` — badge flutuante

Badge simples no canto inferior esquerdo da viewport. Empilha até teto 3.

```jsonc
"selo": {
  "texto": "🎂 Aniversário",         // obrigatório
  "cor":   "#7b1fa2",                // opcional; hex
  "link":  "..."                     // opcional; href
}
```

Renderizado pelo `CampanhaRenderer` como `position:fixed; bottom:16px; left:16px`. z-index 7900.

---

## 2.8 `broadcast` — FORA DA FASE 1

Capacidade de push / WhatsApp / e-mail com opt-in. Implementação prevista para a Fase 2. Não incluir a chave `broadcast` em `config` — o backend a ignora silenciosamente na Fase 1, mas a Fase 2 poderá validar.

---

## Recorrência (gravada na Fase 1, consumida na Fase 2)

O campo `recorrencia` em `campaign` aceita três formatos:

```jsonc
{ "tipo": "none" }                                          // sem recorrência
{ "tipo": "annual" }                                        // rola para o próximo ano ao encerrar
{ "tipo": "seasonal", "inicio": "10-01", "fim": "05-31" }  // MM-DD; pode cruzar virada de ano
```

O admin exibe os três tipos no editor. A Fase 2 lerá o campo para rolar/re-agendar automaticamente.
