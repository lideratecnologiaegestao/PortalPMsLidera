# Spec — CMS Dinâmico

## 1. Objetivo
Permitir que cada prefeitura monte páginas (home, "História do Município", páginas de secretaria) por blocos, sem deploy, e configure a identidade visual.

## 2. Conformidade legal
Acessibilidade (WCAG AA, Design System gov.br). Conteúdo oficial sob responsabilidade do gestor.

## 3. Requisitos funcionais
1. Páginas compostas por blocos ordenáveis (hero, serviços, notícias, galeria, texto rico, mapa).
2. Editar tema (tokens) com pré-visualização e **validação WCAG bloqueante**.
3. Publicar/despublicar; SEO por página.
4. Versionamento básico de página (rascunho vs. publicado).

## 4. Não-funcionais
ISR + cache por tenant; acessibilidade; edição segura (RBAC: gestor/admin).

## 5. Modelo de dados
`cms_pages`, `cms_blocks`, `tenant_themes` — `db/003_theme_cms.sql`. RLS aplicado.

## 6. Contrato de API
- `GET /api/theme` (público) / `PUT /api/theme` (admin) — tokens + WCAG.
- `GET /api/pages/:slug` (público) — página + blocos.
- `POST/PUT /api/pages` e `/api/pages/:id/blocks` (gestor/admin).

## 7. Fluxos
Editar tema → validar contraste → salvar (ou 400 se reprovar) → portal injeta CSS vars. Skill `tema-wcag`.

## 8. Integrações
Object storage para mídia; cache/ISR invalidado por tag ao publicar.

## 9. LGPD/GDPR
Conteúdo público; evitar publicar dado pessoal indevido (orientação ao gestor).

## 10. Critérios de aceite
- Página monta por blocos e publica; tema reprovado não salva.
- Cache invalida ao publicar; acessibilidade AA verificada.
- Teste de isolamento RLS.

## 11. Fora de escopo
Editor visual drag-and-drop avançado (fase posterior); workflow de aprovação multi-nível.
