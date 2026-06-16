# ADR-0001 — Configurações por entidade no Gerenciador da Plataforma

- **Status:** Aceito
- **Data:** 2026-06-14
- **Contexto do trigger:** uma entidade nova (Barão de Melgaço) bateu o teto fixo
  de 2.000 chunks do indexador vetorial, e o pedido evoluiu para "deixar para
  configurar no Gerenciador, assim como recursos de API (Z-API e outros) que
  precisam ser individualizados".

## Contexto

Havia **dois padrões** desconexos para configuração por tenant:

1. **Colunas diretas no model `Tenant`** (18 flags: atendimento, `dpo_*`, `cf_*`,
   `iaChatHabilitada`…). Simples, mas exige migration por campo e infla a tabela.
2. **Tabela satélite dedicada** `tenant_whatsapp_config` (migration 052): 1 linha
   por tenant, **segredos cifrados em repouso** (AES-256-GCM via
   `secret-box.util.ts`), **mascaramento** na API (`configMascarada()`) e
   **fallback banco→env**. Padrão maduro e reaproveitável.

Problemas: chaves de IA (`VOYAGE/ANTHROPIC/OPENAI`) e o teto de chunks eram
**globais/hardcoded**; e o Gerenciador (super_admin) só expunha 3 checkboxes —
WhatsApp, IA, atendimento e DPO não tinham interface central.

## Decisão

1. **Adotar o padrão satélite + secret-box como o padrão canônico** para recursos
   por entidade que envolvam segredos. Nova tabela `tenant_ia_config`
   (migration 056) para IA, espelhando `tenant_whatsapp_config`.
2. **Modelo "global + override opcional":** o `.env` global continua o padrão; a
   entidade só sobrepõe o que preencher (limite de chunks, provedor de embeddings,
   chaves Voyage/Anthropic/OpenAI). Sem chave própria → usa a global. Não quebra
   nenhuma entidade existente.
3. **Resolução em runtime num ponto único** (`TenantIaConfigService`), consumido
   por `EmbeddingsService`, `AnthropicService` e `IaIndexadorService`. Leitura por
   RLS dentro de `TenantContext`; cache curto (60s) no hot path de embeddings.
4. **Painel "Configurações da Entidade" no Gerenciador** (`/_platform/tenants/:id/config/*`,
   só `super_admin`), com 4 domínios: **IA · WhatsApp · Atendimento · LGPD/DPO**.
   - Segredos **nunca** retornam em claro (GET mascarado: flags `*Definido/Proprio`).
   - Escrita cifra via secret-box; convenção: campo ausente mantém, `''` limpa
     (volta ao global), `iaMaxChunks: null` limpa o teto.
   - Auditoria por alteração registra **só os campos** mudados, nunca valores.
   - Atendimento/LGPD são colunas do `Tenant` → escrita via `prisma.platform()`
     (cross-tenant explícito); IA/WhatsApp via `TenantContext.run({tenantId})`
     (RLS preserva o isolamento mesmo para o super_admin).

## Consequências

- **Positivas:** novos recursos individualizáveis seguem um padrão único e seguro;
  o teto de chunks vira ajuste por entidade; cada prefeitura pode (opcionalmente)
  usar a própria chave de IA para isolamento de custo; super_admin gerencia tudo
  num lugar. A fronteira de camadas é respeitada (web→API only).
- **Negativas / limites:** a UI vive no Gerenciador (super_admin), não no admin do
  tenant — decisão deliberada (são parâmetros operacionais/billing da plataforma).
  O fallback banco→env significa que remover a chave global afeta todas as
  entidades sem chave própria. Trocar provedor/modelo de embeddings exige
  **reindexar** (o lexema/vetor muda).
- **Não-objetivo:** não criamos uma tabela genérica `tenant_settings(key,value)`;
  preferimos satélites tipadas por domínio (type-safety + cripto seletiva).

## Alternativas consideradas

- **Tabela genérica key→value:** flexível, mas perde type-safety e mistura
  segredos com não-segredos; exigiria um registry para renderizar a UI. Rejeitada.
- **Tudo em colunas no `Tenant`:** infla a tabela e não resolve cripto de segredo
  de forma limpa. Rejeitada para os campos sensíveis.
