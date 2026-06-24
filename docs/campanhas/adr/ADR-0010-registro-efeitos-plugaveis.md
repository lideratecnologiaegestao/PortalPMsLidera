# ADR-0010 — Registro de Efeitos Plugáveis

**Status:** Aceito  
**Data:** 2026-06  
**Módulo:** Campanhas — Efeitos interativos

---

## Contexto

Efeitos interativos (overlay de mosquitos, confete de copa, etc.) são componentes visuais ricos que variam muito entre campanhas. Antes deste módulo, o overlay da dengue existia como componente hardcoded ativado por uma flag em `site_settings` — sem parâmetros configuráveis pelo admin e sem suporte a múltiplos efeitos.

O desafio: permitir que novos efeitos sejam adicionados sem modificar a lógica central do resolver ou do `CampanhaRenderer`, mantendo o contrato de validação no backend e a segurança de que efeitos desconhecidos não causam crashes no portal.

---

## Decisão

**Registry no frontend:** objeto estático `EFEITOS_REGISTRY: Record<string, ComponentType<EfeitoProps>>` em `web/components/campanhas/efeitos/registry.ts`. O `CampanhaRenderer` usa `EFEITOS_REGISTRY[efeito.nome]` para montar o componente — sem `if/else` crescente, sem `dynamic()` por efeito.

**Lista de suportados no backend:** constante `EFEITOS_SUPORTADOS` em `capabilities/validator.ts`. O backend valida `efeito.nome` contra esta lista ao salvar. Efeito desconhecido → 400 com mensagem clara. Isso evita que o admin configure efeitos que o frontend não sabe renderizar.

**Params tipados por efeito:** cada efeito tem sua função de validação de params (`validarParamsAedes`, `validarParamsCopa`) chamada em `validarEfeito`. Params inválidos → 400.

**Renderização tolerante:** o `CampanhaRenderer` aceita `null` do registry sem crash (efeito nome desconhecido em runtime → simplesmente não renderiza). Protege contra divergência temporária entre deploy do backend e do frontend.

**Interface uniforme `EfeitoProps`:** todo componente de efeito recebe `{ efeito: CampanhaEfeito, tenantHost: string }`. O `tenantHost` serve para escopar o estado de dispensa em `localStorage`.

**Contratos de acessibilidade obrigatórios para todo efeito:**
- Respeitar `prefers-reduced-motion`.
- Não bloquear acesso a elementos essenciais.
- `aria-hidden` se decorativo; `role="dialog"` se tem popup de interação.
- Limpeza completa no unmount.

---

## Consequências

- Adicionar um novo efeito requer: (1) criar o componente, (2) registrar no registry, (3) adicionar ao `EFEITOS_SUPORTADOS` do backend, (4) adicionar validação de params. Processo linear e bem documentado em `runbook.md`.
- O backend é a fonte de verdade sobre quais efeitos existem — o admin nunca consegue configurar um efeito que o portal não conhece.
- Deploy simultâneo de backend e frontend é necessário ao lançar um novo efeito (risco mitigado pela renderização tolerante: se só o backend for deployado primeiro, o efeito é salvo mas não renderizado até o frontend atualizar).
- Sem hot-reload de efeitos em runtime — novos efeitos exigem deploy. Aceitável para o ritmo de mudanças esperado (novo efeito a cada campanha especial, não a cada hora).

---

## Alternativas consideradas

**Componentes remotos (Module Federation / carregamento dinâmico de URL):** efeitos seriam carregados de URLs configuradas no admin. Rejeitado por complexidade de segurança (CSP, injeção de código) e operacional (hosting, versioning) muito além do escopo.

**Efeitos definidos em JSON/DSL:** o admin configura animações sem código (ex.: partículas com propriedades numéricas). Rejeitado porque os efeitos existentes (mosquitos com física de bounce, canvas 2D com imagens) não são bem expressos em DSL simples — a expressividade de um componente React é necessária.

**Switch/case no CampanhaRenderer:** cada novo efeito adicionaria um `if` ao componente principal. Rejeitado pelo crescimento linear e pela violação de Open/Closed — o renderer não deveria mudar ao adicionar um efeito.
