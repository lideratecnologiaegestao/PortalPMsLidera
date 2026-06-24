# Runbook — Módulo Campanhas

Guia operacional para gestores de conteúdo (prefeitura/ops) e desenvolvedores.

---

## Para gestores de conteúdo

### Instalar e publicar um preset

1. Acesse `/admin/campanhas` no painel da prefeitura.
2. Na seção **Biblioteca de presets**, localize a campanha desejada (filtre por categoria se necessário).
3. Clique em **Usar / Instalar** no card do preset.
4. O sistema clona o preset com `status = Rascunho` e abre o editor automaticamente.
5. No editor, revise:
   - **Período** (início e fim com data e hora).
   - **Prioridade** (maior número = maior precedência em conflito com outra campanha ativa).
   - **Capacidades** — habilite/desabilite e ajuste conteúdo de cada peça (tema, faixa, banner, popup, efeito, página, selo).
   - Para banners e imagens de popup: clique em **Selecionar imagem** e escolha da biblioteca de mídia.
6. Clique em **Salvar**.
7. De volta à lista **Minhas campanhas**, clique em **Ligar** para ativar (`status → active`).

A campanha aparece no portal após no máximo 60 segundos (TTL do cache Redis).

---

### Agendar uma campanha (definir período sem publicar ainda)

1. No editor da campanha, defina **Início** e **Fim**.
2. Salve com `status = Rascunho`.
3. Quando quiser colocar na fila de agendamento, clique **Ligar** para `active`, ou use `PATCH /status` com `scheduled` se quiser que a campanha entre automaticamente ao chegar na data (Fase 2 — por ora o resolver já respeita a janela de datas; `active + janela futura` = campanha não aparece ainda).

Para que a campanha entre exatamente na data sem ação manual adicional (Fase 1): defina `starts_at`, publique como `active` — o resolver filtra `starts_at <= now()`, então antes da data ela não aparecerá no portal mesmo com status `active`.

---

### Ligar e desligar campanha

Na tabela **Minhas campanhas**, a coluna Ações exibe **Ligar** ou **Desligar** dependendo do status atual:

- Campanha em `draft`, `scheduled`, `paused` → botão **Ligar** → muda para `active`.
- Campanha em `active` → botão **Desligar** → muda para `paused`.

Uma campanha `paused` nunca aparece no portal, independentemente da janela de datas. A mudança de status invalida o cache imediatamente.

---

### Criar campanha customizada (sem preset)

1. Clique em **Nova campanha** no topo da página.
2. Preencha nome, período, prioridade e recorrência.
3. Habilite as capacidades desejadas no editor.
4. Salve. A campanha fica em `draft`; use **Ligar** para ativar.

---

### Encerrar e arquivar

- Use **Editar** → `PATCH /status` com `ended` para encerrar manualmente.
- Use `archived` para remover da lista ativa sem excluir o registro.
- **Excluir** remove permanentemente (cascata no `campaign_activation_log`).

---

### Ano eleitoral

Em anos eleitorais (anos pares no Brasil), o painel exibe um aviso sobre as vedações da Lei 9.504/97. O recomendado é pausar ou agendar campanhas institucionais fora do período vedado (90 dias antes do pleito). Consulte sempre o jurídico do município. O sistema não garante conformidade eleitoral — veja `acessibilidade-lgpd.md` para detalhes.

---

## Para desenvolvedores

### Adicionar um novo efeito plugável

Um efeito é um componente React client-side registrado em `EFEITOS_REGISTRY`. O backend valida o nome do efeito contra a lista `EFEITOS_SUPORTADOS` no validator.

**Passo 1 — Criar o componente frontend**

Crie `web/components/campanhas/efeitos/MeuEfeito.tsx`. O componente deve:

- Ser `'use client'`.
- Implementar a interface `EfeitoProps` de `registry.ts`:
  ```typescript
  interface EfeitoProps {
    efeito: CampanhaEfeito;   // { campaignId, nome, params }
    tenantHost: string;
  }
  ```
- Respeitar `prefers-reduced-motion`: se a media query for verdadeira, não iniciar animação (fallback estático ou silêncio total).
- Se capturar interação do usuário, fornecer uma saída ("Pular" ou equivalente).
- **Nunca** bloquear cliques em elementos essenciais do portal (`pointer-events:none` no contêiner ou garantir que o efeito fique em z-index controlado).
- `aria-hidden="true"` no contêiner se for puramente decorativo.
- Limpar todos os efeitos colaterais (timers, rAF, DOM manipulado diretamente) no retorno do `useEffect`.

**Passo 2 — Registrar no registry frontend**

Em `web/components/campanhas/efeitos/registry.ts`:

```typescript
import MeuEfeito from './MeuEfeito';

export const EFEITOS_REGISTRY: Record<string, ComponentType<EfeitoProps>> = {
  'aedes-overlay': AedesOverlay,
  'copa-overlay':  CopaOverlay,
  'meu-efeito':    MeuEfeito,   // adicionar aqui
};
```

**Passo 3 — Registrar no validator backend**

Em `api/src/modules/campanhas/capabilities/validator.ts`:

```typescript
const EFEITOS_SUPORTADOS: EfeitoCap['nome'][] = [
  'aedes-overlay',
  'copa-overlay',
  'meu-efeito',  // adicionar aqui
];
```

Atualize também o tipo `EfeitoCap['nome']`:

```typescript
export interface EfeitoCap {
  nome: 'aedes-overlay' | 'copa-overlay' | 'meu-efeito';
  params: Record<string, unknown>;
}
```

**Passo 4 — Validar params no backend (opcional, mas recomendado)**

Adicione uma função `validarParamsMeuEfeito` e chame-a em `validarEfeito`:

```typescript
function validarParamsMeuEfeito(params: Record<string, unknown>): void {
  // ex.: validar campo obrigatório
  if (params.cor !== undefined) validarHexOpcional(params.cor, 'meu-efeito: params.cor');
}

function validarEfeito(efeito: unknown): EfeitoCap {
  // ...
  if (e.nome === 'meu-efeito') validarParamsMeuEfeito(params);
  // ...
}
```

**Passo 5 — Documentar params**

Adicione uma seção em `docs/campanhas/capacidades.md` no bloco §2.6 com o schema dos params do novo efeito.

**Passo 6 — Adicionar ao seed (se for preset padrão da plataforma)**

Adicione uma entrada em `api/src/modules/campanhas/seeds/biblioteca.ts` e re-execute `POST /api/admin/campanhas/_semear`.

---

### Atualizar os seeds da biblioteca

Para adicionar ou modificar presets globais:

1. Edite `api/src/modules/campanhas/seeds/biblioteca.ts` — adicione/modifique entradas em `BIBLIOTECA_PRESETS`.
2. Use `deriveFg(corPrimaria)` para gerar o `corPrimariaFg` automaticamente (garante WCAG AA).
3. Faça deploy da API.
4. Execute `POST /api/admin/campanhas/_semear` (via painel como super_admin ou curl).

O upsert é por `key` — presets existentes são atualizados, novos são criados.

---

### Fase 2 — Scheduler autônomo (nota de implementação futura)

Quando a Fase 2 for implementada, os passos serão:

1. Criar um job BullMQ repetível (ex.: a cada 15 min e à meia-noite) em `api/src/modules/campanhas/campanhas-scheduler.service.ts`.
2. O job busca campanhas via `prisma.platform()` (cross-tenant, somente leitura) filtrando:
   - `scheduled` com `starts_at <= now()` → transitar para `active`.
   - `active` com `ends_at < now()` → transitar para `ended`.
   - `ended` com `recorrencia != none` e `autonomous = true` → calcular próxima ocorrência e re-criar/reagendar.
3. Cada transição grava em `campaign_activation_log` com `ator = 'scheduler'` e invalida o cache do tenant.
4. Idempotência: usar `jobId` fixo por campanha para evitar processamento duplo.
5. O campo `autonomous` em `campaign` controla quais campanhas o scheduler gerencia; as demais continuam com transições manuais.
