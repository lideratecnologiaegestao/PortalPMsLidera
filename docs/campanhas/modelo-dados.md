# Modelo de Dados — Módulo Campanhas

Migration: `db/084_campanhas.sql`

## Tabelas

### `campaign_template` — biblioteca global (sem `tenant_id`)

Dado de plataforma, igual ao padrão adotado em `ia_conteudos_global` (migration 079). A plataforma Lidera mantém os presets; prefeituras apenas lêem.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | uuid PK | sim | `gen_random_uuid()` |
| `key` | text UNIQUE | sim | Chave técnica do preset (ex.: `dengue`, `outubro-rosa`). Referenciada em `campaign.template_key`. |
| `nome` | text | sim | Nome legível para exibição na biblioteca do admin. |
| `categoria` | text | sim | `saude` \| `civico` \| `sazonal` \| `fiscal` \| `ambiental` \| `cultural` \| `administrativo` |
| `descricao` | text | não | Descrição para o painel admin. |
| `icone` | text | não | Emoji curto (ex.: `🦟`). |
| `config_default` | jsonb | sim | Capacidades + params padrão. Copiado para `campaign.config` ao instalar. |
| `sugestao` | jsonb | sim | `{ starts_at?, ends_at?, recorrencia?, prioridade? }` — sugestão para o tenant. |
| `prioridade_sugerida` | int | sim | Prioridade copiada para `campaign.prioridade` ao instalar. Padrão 100. |
| `ativo` | boolean | sim | Presets inativos não aparecem na biblioteca. Padrão `true`. |
| `criado_em` | timestamptz | sim | `DEFAULT now()` |
| `atualizado_em` | timestamptz | sim | Atualizado por trigger em todo UPDATE. |

**RLS:**

```sql
-- SELECT: permitido a qualquer sessão (bots, frontends, tenants)
CREATE POLICY leitura_global ON campaign_template
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: restrito à plataforma Lidera
CREATE POLICY escrita_global ON campaign_template
  FOR ALL
  USING (app_is_platform())
  WITH CHECK (app_is_platform());
```

**Índice:** `idx_campaign_template_categoria_ativo (categoria, ativo)` — filtro da biblioteca por categoria.

---

### `campaign` — instância por tenant

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | uuid PK | sim | `gen_random_uuid()` |
| `tenant_id` | uuid FK tenants | sim | Isolamento multi-tenant. `ON DELETE CASCADE`. |
| `template_key` | text | não | Chave do preset de origem. `NULL` = campanha custom. Armazenado como texto (não FK) para preservar histórico mesmo que o preset global seja renomeado. |
| `nome` | text | sim | Nome legível no painel do tenant. |
| `status` | text | sim | `draft` \| `scheduled` \| `active` \| `paused` \| `ended` \| `archived`. Default `draft`. |
| `starts_at` | timestamptz | não | Início da vigência. `NULL` = sem limite inferior. |
| `ends_at` | timestamptz | não | Fim da vigência. `NULL` = sem limite superior. |
| `recorrencia` | jsonb | não | `{ tipo: 'none'|'annual'|'seasonal', inicio?, fim? }`. Gravado na Fase 1; consumido pelo scheduler na Fase 2. |
| `autonomous` | boolean | sim | Fase 2 apenas. Na Fase 1 sempre `false`. Default `false`. |
| `prioridade` | int | sim | Maior número = maior precedência. Default 100. Empate desempata por `criado_em DESC`. |
| `config` | jsonb | sim | Capacidades habilitadas + overrides do tenant. Schema detalhado em `capacidades.md`. Default `{}`. |
| `criado_por` | uuid FK users | não | UUID do servidor que criou. `ON DELETE SET NULL`: campanha preservada ao excluir usuário. |
| `criado_em` | timestamptz | sim | `DEFAULT now()` |
| `atualizado_em` | timestamptz | sim | Atualizado por trigger. |

**RLS:** `SELECT app_enable_tenant_rls('campaign')` — isolamento padrão multi-tenant do projeto. Cada sessão enxerga apenas campanhas do seu `app.current_tenant_id`.

**Índices:**

| Nome | Colunas | Uso |
|------|---------|-----|
| `idx_campaign_tenant_status` | `(tenant_id, status)` | Filtro principal do resolver e do painel. |
| `idx_campaign_tenant_starts_ends` | `(tenant_id, starts_at, ends_at)` | Filtro da janela de datas no resolver. |
| `idx_campaign_tenant_id` | `(tenant_id)` | Apoio ao planner RLS. |

---

### `campaign_activation_log` — auditoria por tenant

Log imutável (append-only) de todas as transições e ações sobre campanhas. Complementa o `audit_log` da regra inviolável 6 com granularidade específica do módulo.

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | uuid PK | sim | `gen_random_uuid()` |
| `tenant_id` | uuid FK tenants | sim | `ON DELETE CASCADE`. |
| `campaign_id` | uuid FK campaign | sim | `ON DELETE CASCADE`: apagar a campanha remove seu log. |
| `acao` | text | sim | `created` \| `installed` \| `updated` \| `activated` \| `deactivated` \| `scheduled` \| `autostarted` \| `ended` |
| `ator` | text | sim | Literal `scheduler` (Fase 2) ou UUID do usuário em texto. |
| `detalhes` | jsonb | sim | Dados contextuais da ação. Sem PII. Default `{}`. |
| `criado_em` | timestamptz | sim | `DEFAULT now()` |

**Permissões:** `portal_app` recebe `SELECT, INSERT, DELETE` (sem UPDATE — logs são imutáveis). `portal_ro` recebe apenas `SELECT`.

**RLS:** `SELECT app_enable_tenant_rls('campaign_activation_log')`.

**Índice:** `idx_campaign_activation_log_tenant_campaign (tenant_id, campaign_id)`.

---

## Models Prisma

Os models seguem a convenção do repositório: `@map`/`@@map` snake_case, `@db.Uuid`, `@db.Timestamptz(6)`, campos JSONB como `Json`.

```prisma
model CampaignTemplate {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key                String   @unique
  nome               String
  categoria          String
  descricao          String?
  icone              String?
  configDefault      Json     @map("config_default")
  sugestao           Json
  prioridadeSugerida Int      @default(100) @map("prioridade_sugerida")
  ativo              Boolean  @default(true)
  criadoEm          DateTime @default(now()) @map("criado_em") @db.Timestamptz(6)
  atualizadoEm      DateTime @default(now()) @map("atualizado_em") @db.Timestamptz(6)

  @@map("campaign_template")
}

model Campaign {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  templateKey  String?   @map("template_key")
  nome         String
  status       String    @default("draft")
  startsAt     DateTime? @map("starts_at") @db.Timestamptz(6)
  endsAt       DateTime? @map("ends_at") @db.Timestamptz(6)
  recorrencia  Json?
  autonomous   Boolean   @default(false)
  prioridade   Int       @default(100)
  config       Json
  criadoPor    String?   @map("criado_por") @db.Uuid
  criadoEm     DateTime  @default(now()) @map("criado_em") @db.Timestamptz(6)
  atualizadoEm DateTime  @default(now()) @map("atualizado_em") @db.Timestamptz(6)

  logs CampaignActivationLog[]

  @@map("campaign")
}

model CampaignActivationLog {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  campaignId String   @map("campaign_id") @db.Uuid
  acao       String
  ator       String
  detalhes   Json
  criadoEm   DateTime @default(now()) @map("criado_em") @db.Timestamptz(6)

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@map("campaign_activation_log")
}
```

`CampaignTemplate` é lida via `prisma.db` (policy `SELECT USING true` não exige `platform()`) e escrita via `prisma.platform()` (satisfaz `app_is_platform()`).

## Base legal LGPD

Conteúdo de campanha (nome, cores, textos, imagens referenciadas) não contém dados pessoais (PII). Base legal: comunicação institucional / interesse público (LGPD art. 7º, III e IX). O log de auditoria registra o `ator` (UUID do servidor), que é dado funcional interno, não sensível para fins da LGPD.
