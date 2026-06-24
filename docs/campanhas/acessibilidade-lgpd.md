# Acessibilidade e LGPD — Módulo Campanhas

## WCAG 2.1 AA

### Tema de cores

O guard de contraste está implementado no backend em `api/src/modules/campanhas/capabilities/wcag.ts`. Na escrita de qualquer campanha com capacidade `tema`:

- Se `corPrimariaFg` for omitido: o sistema deriva automaticamente `#ffffff` ou `#000000`, escolhendo o que tiver maior razão de contraste com `corPrimaria` (WCAG 2.1 §1.4.3, razão mínima 4.5:1 para texto normal). Nunca falha por omissão.
- Se `corPrimariaFg` for informado: o par é validado. Se a razão de contraste for inferior a 4.5:1, a requisição falha com 400 e mensagem clara (`"razão X.XX:1 (mínimo WCAG AA: 4.5:1). Omita corPrimariaFg para derivação automática."`).

O tema é descartado antes de ser salvo caso não passe — a regra inviolável 3 do projeto proíbe salvar tema reprovado no contraste.

As cores de `faixa` (`corBg`/`corTexto`) não são validadas automaticamente pelo backend — o admin é responsável pela escolha. O painel admin exibe os pickers de cor com pré-visualização; use um verificador externo (ex.: WebAIM Contrast Checker) para confirmar.

### Pop-up

O componente `CampanhaPopup.tsx` implementa:

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby={tituloId}`.
- Foco gerenciado: ao abrir, `dialogRef.current.focus()` posiciona o foco no contêiner do diálogo.
- Fecha com **Esc** (listener no `window`), **clique no backdrop**, ou **botão X** (aria-label "Fechar").
- Botão de rodapé "Fechar" como ação alternativa acessível ao teclado.
- Frequência limitada: o popup não reaparece sem a autorização do usuário (`frequencia: "dia"` por padrão, controlado via `localStorage` com TTL).

### Faixa (ribbon)

O componente `CampanhaFaixa.tsx` implementa:

- `role="region"` + `aria-label` descritivo com o texto da mensagem.
- Botão × com `aria-label="Fechar aviso"`, navegável por teclado.
- **Esc** dispensa a faixa.
- Dispensa persiste em `localStorage` escopado por `tenantHost:campaignId`.

### Efeitos interativos

Todos os efeitos devem (e os dois implementados cumprem):

- Respeitar `prefers-reduced-motion: reduce`:
  - `aedes-overlay`: exibe um banner estático dispensável no canto inferior direito, sem animação, com botão "Saiba mais" que abre o popup.
  - `copa-overlay`: canvas fica limpo (sem loop de animação).
- Fornecer saída ao usuário:
  - `aedes-overlay`: botão "Não mostrar novamente" dispensa o efeito com TTL em `localStorage`.
  - `copa-overlay`: `pointer-events:none` em tudo — puramente decorativo, nunca requer interação.
- `aria-hidden="true"` no contêiner quando puramente decorativo (`copa-overlay`).
- Limpeza completa no unmount (cancelamento de rAF, timers, remoção de elementos DOM adicionados via `document.body.appendChild`).

### Regra geral

Nenhuma campanha pode bloquear o acesso do cidadão a serviços essenciais. Efeitos que cubram botões de serviço, links de navegação principal ou formulários essenciais são proibidos. O CampanhaRenderer fica sempre abaixo do cookie consent (`z-50`) no z-index.

---

## LGPD

### Ausência de PII no conteúdo

O conteúdo de uma campanha (nome, cores, textos de faixa/popup, URL de banner, params de efeito) não contém e não deve conter dados pessoais (PII). A base legal do tratamento é comunicação institucional / interesse público (LGPD art. 7º, III e IX).

O campo `detalhes` em `campaign_activation_log` armazena metadados da ação (campos alterados, `templateKey`, nome da campanha) — sem PII.

### Auditoria

Toda ação sensível grava em dois lugares:

1. `campaign_activation_log` — granularidade de ações do módulo (`created`, `installed`, `updated`, `activated`, `deactivated`, `scheduled`, `ended`).
2. `audit_log` — registro do projeto (`CAMPANHA_CRIAR`, `CAMPANHA_ATUALIZAR`, `CAMPANHA_STATUS_ACTIVE`, `CAMPANHA_EXCLUIR`, etc.) via `prisma.db.auditLog.create`.

O `ator` registrado é o UUID do servidor público ou o literal `'scheduler'` — dado funcional interno, não sensível para fins de LGPD de titulares externos.

### localStorage do frontend

O frontend usa `localStorage` e `sessionStorage` para controlar frequência de popup e dispensa de faixa/efeito. As chaves são escopadas por `tenantHost:campaignId` e contêm apenas timestamps de expiração — sem dado pessoal identificável.

---

## Aviso de ano eleitoral (Lei 9.504/97)

O painel `/admin/campanhas` exibe automaticamente um aviso quando o ano corrente for eleitoral (anos pares no Brasil, que têm eleições municipais e/ou federais):

> "Em [ano], a Lei das Eleições proíbe propaganda institucional de atos, programas, obras, serviços e campanhas dos órgãos públicos durante os 3 meses anteriores ao pleito, salvo nos casos autorizados em lei (art. 73). Recomenda-se pausar ou agendar campanhas fora do período vedado e consultar o jurídico do município. **Este sistema não garante conformidade eleitoral — a responsabilidade é do gestor e do órgão público.**"

O sistema fornece os mecanismos para pausar e agendar campanhas fora do período vedado, mas **não garante nem verifica automaticamente conformidade com a legislação eleitoral**. A conformidade é responsabilidade do município e do seu departamento jurídico.

Verificação técnica: `const eAnoEleitoral = new Date().getFullYear() % 2 === 0` em `web/app/admin/campanhas/page.tsx`.
