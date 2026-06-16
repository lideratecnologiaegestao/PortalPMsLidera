---
name: tema-wcag
description: Como funciona o tema dinâmico por tenant e a validação de acessibilidade WCAG deste projeto. Use SEMPRE que mexer em cores, design tokens, identidade visual, tema, branding por prefeitura, ou qualquer UI pública. Acione a qualquer menção a tema, cor, token, contraste, WCAG, acessibilidade, branding ou Design System gov.br.
---

# Tema dinâmico + WCAG

Um único build serve todas as prefeituras; cada tenant tem seus design tokens.

## Fluxo dos tokens
1. Tokens ficam em `tenant_themes.tokens` (JSONB), validados por Zod (`themeTokensSchema` em `theme.service.ts`).
2. A API (`GET /api/theme`) resolve o tenant pelo Host e devolve os tokens.
3. O Next.js (`web/app/layout.tsx`) injeta os tokens como **CSS custom properties** no `:root` no servidor (sem flash de cor errada).
4. O Tailwind (`web/tailwind.config.ts`) mapeia cores/fontes para `var(--color-*)`. **Nunca** crave cor fixa — use `bg-primary`, `text-fg`, etc.

## Estrutura dos tokens
`colors` (primary, primaryFg, secondary, secondaryFg, accent, bg, fg, muted, border, success, warning, danger), `fonts` (sans, heading), `radius.base`, `logo` (url, alt), `favicon`, `iconSet`. O default (`DEFAULT_TOKENS`) parte das cores do Design System gov.br.

## Acessibilidade é bloqueante (lei)
- Ao salvar tema, `validateThemeColors()` (`contrast.util.ts`) checa o contraste WCAG AA dos pares críticos. Se reprovar, **o save lança 400** com o relatório — não há override.
- Mínimos: texto normal 4.5:1; UI/primária sobre fundo 3.0:1.
- A UI também deve: HTML semântico, foco visível, navegação por teclado, alt text, `lang="pt-BR"`, VLibras, e seguir o Design System gov.br.

## Ao adicionar um token
1. Estenda `themeTokensSchema` e `DEFAULT_TOKENS` na API.
2. Inclua no `toCssVariables()` (API) e no `tokensToCss()` (web).
3. Mapeie no `tailwind.config.ts`.
4. Se for cor de texto/fundo, adicione o par ao `validateThemeColors()`.
