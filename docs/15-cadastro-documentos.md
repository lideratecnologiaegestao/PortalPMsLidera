# Cadastro de Documentos (motor único) — Fase 1

> Reestrutura o antigo cadastro genérico de documentos em **cadastros
> especializados** (Leis, Decretos, Portarias/Resoluções, Alvarás, Documentos
> Diversos), cada um com **taxonomia própria** (tipos), **slug/rota** e **item de
> menu automático**, além de **contador de downloads** e **abertura de PDF em nova
> aba**. Prompt de origem: `prompts/cadastro-documentos-prompt/`.

## Decisão de arquitetura (ADR resumido)

**Contexto.** O prompt pede 8+ cadastros, cada um com sua taxonomia do TCE-MT,
slug, menu automático e páginas públicas.

**Decisão.** Em vez de 8 módulos codados à mão (duplicação e manutenção alta),
um **motor único** de 3 tabelas genéricas:

- `doc_cadastros` — o "registro" (Leis, Decretos…). Cada um tem `slug` → rota
  pública `/documentos/{slug}` + um item de menu automático.
- `doc_tipos` — a **taxonomia** de cada cadastro (ex.: as 83 naturezas de lei do
  TCE-MT). Usada como **filtro** na página pública.
- `documentos` — o documento em si: número, ano, data, ementa, situação, arquivo
  (biblioteca de mídia), `slug` e **`downloads`** (contador).

**Consequências.** Um admin, uma página pública e um conjunto de endpoints
servem todos os cadastros. O cadastro "genérico" sai de graça. Campos
relacionais ricos (modalidade+critério de Licitação, membros de Conselho, fases
de Concurso) ficam para a **Fase 2** como extensões — não bloqueiam a Fase 1.

## Modelo de dados (migration `db/028_documentos.sql`)

Todas as tabelas têm `tenant_id` + **RLS** (`app_enable_tenant_rls`).

| Tabela | Campos principais |
|---|---|
| `doc_cadastros` | `slug` (citext, único por tenant), `nome`, `descricao`, `icone`, `ordem`, `taxonomia_seed`, `ativo` |
| `doc_tipos` | `cadastro_id`, `codigo` (TCE-MT), `nome`, `slug`, `ordem`, `meta` (jsonb, flags), `destacar_menu`, `ativo` — único por (tenant, cadastro, slug) |
| `documentos` | `cadastro_id`, `tipo_id`, `numero`, `ano`, `data_documento`, `titulo`, `ementa`, `orgao`, `situacao`, `slug`, `arquivo_url`, `storage_key`, `tags[]`, **`downloads`**, `ativo`, `publicado_em` — único por (tenant, cadastro, slug) |

Prisma: models `DocCadastro`, `DocTipo`, `Documento` (`api/prisma/schema.prisma`).

## Backend (`api/src/modules/documentos/`)

- `documentos.service.ts` — CRUD de cadastros/tipos/documentos + seeding +
  contador de download. Gera `slug` único por tenant; sincroniza o **menu
  automático** via `MenusService` (grupo "Documentos Oficiais" → item por
  cadastro, `refTipo='doc_cadastro'`).
- `cadastros-padrao.ts` + `seeds/natureza_lei.json` — os 5 cadastros da Fase 1 e
  seus tipos (Leis usa as 83 naturezas oficiais do TCE-MT; os demais usam tipos
  sugeridos, editáveis).

### Contrato de API

Público (`/api/documentos`):

| Método | Rota | Descrição |
|---|---|---|
| GET | `/documentos/cadastros` | lista os cadastros ativos |
| GET | `/documentos/:cadastroSlug?tipo=&ano=&q=&page=` | cadastro + tipos + documentos paginados |
| GET | `/documentos/baixar/:id` | **incrementa o contador** e **redireciona (302)** ao arquivo |

Admin (`/api/admin/documentos`, RBAC gestor/admin, RLS):

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/cadastros` · PUT/DELETE `/cadastros/:id` | gerencia cadastros (auto-menu) |
| GET/POST | `/cadastros/:id/tipos` · PUT/DELETE `/tipos/:id` | gerencia a taxonomia |
| POST | `/_semear` | semeia os cadastros padrão no tenant atual |
| GET | `/?cadastroId=&tipoId=&q=&page=` · GET `/:id` | lista/lê documentos |
| POST | `/` · PUT `/:id` · DELETE `/:id` | cria/edita/exclui documento |

## Frontend (Next.js)

- Pública: `web/app/documentos/[cadastro]/page.tsx` — lista por cadastro, com
  **filtros** (tipo/ano/busca) acessíveis (form GET), **contador de downloads**
  visível e botão **"Abrir PDF"** (`target="_blank"` → `/api/documentos/baixar/:id`).
  Fetch `no-store` (`web/lib/documentos.ts`) para refletir edições na hora.
- Admin: `web/app/admin/documentos/page.tsx` — abas por cadastro, busca, tabela
  (com downloads) e modal de documento com seleção de tipo + **MediaPicker** do
  PDF. Item "Documentos" no menu do AdminShell (grupo Conteúdo e Transparência).

## PDF em nova aba + contador de downloads

O link público aponta para `/api/documentos/baixar/:id` com `target="_blank"
rel="noopener noreferrer"`. O backend **incrementa `downloads`** e responde
**302** para o arquivo na biblioteca de mídia — que abre na nova aba. Assim o PDF
sempre abre em outra aba **e** cada acesso é contabilizado.

## Guia do admin (como cadastrar)

1. Menu **Conteúdo e Transparência → Documentos**.
2. Escolha a aba do cadastro (Leis, Decretos…). Clique **Novo documento**.
3. Selecione o **tipo** (taxonomia), preencha número/ano/data/título/ementa,
   e **Selecionar arquivo…** (PDF da biblioteca de mídia).
4. Salvar. O documento aparece na **página pública** `/documentos/{cadastro}`
   imediatamente, e o cadastro já está no **menu** do portal.

## Conformidade

- **RLS** por tenant em todas as tabelas (isolamento testado).
- **Acessibilidade**: filtros com `label`/`for`, navegação por teclado, foco
  visível; PDF em nova aba com `rel="noopener"`.
- **LGPD**: documentos são informação pública; o arquivo sobe pela biblioteca de
  mídia (regra 2b — front nunca toca o storage). O contador é agregado (sem PII).
- **TCE-MT/PNTP**: taxonomia oficial (natureza_lei) nos tipos de Leis.

## Fase 2 — Licitações (entregue)

Cadastro relacional próprio (`api/src/modules/licitacoes/`, migration
`db/029_licitacoes.sql`): cada **licitação** tem **modalidade** (seed
`modalidade_licitacao.json`, 70, com flags Lei 8.666/14.133) + **critério de
julgamento** (seed `criterio_julgamento_licitacao.json`, 12), número/ano, objeto,
situação, órgão, data de abertura, e **vários documentos por fase** (Edital,
Ata, Resultado, Homologação, ARP, Contrato…), cada um com **contador de
downloads**.

- Público: `/licitacoes` (lista com filtros modalidade/situação/ano/busca) e
  `/licitacoes/[slug]` (detalhe com base legal + documentos agrupados por fase,
  cada um com **Abrir PDF** em nova aba via `/api/licitacoes/baixar/:id`).
- Admin: `/admin/licitacoes` (CRUD da licitação com selects de modalidade/critério
  + gerência de documentos por fase com MediaPicker). Item "Licitações" no
  AdminShell e item público "Licitações" no menu "Documentos Oficiais" (auto).
- API: público `/api/licitacoes[/modalidades|/baixar/:id|/:slug]`; admin
  `/api/admin/licitacoes` (CRUD + `/:id/documentos`, `/documentos/:docId`,
  `/modalidades`, `/criterios`, `/_semear`).

## Fase 3 — Conselhos Municipais (entregue)

Cadastro relacional (`api/src/modules/conselhos/`, migration `db/030_conselhos.sql`):
cada **conselho** tem um **tipo** (seed `tipo_conselho_municipal.json`, 41, com
flag de obrigatoriedade), **membros** (nome, papel — `tipo_membro_conselho`:
Presidente/Representante/Designado —, segmento, mandato) e **documentos** (atas,
lei de criação, regimento…), cada documento com **contador de downloads**.

- Público: `/conselhos` (lista, filtro por tipo/busca) e `/conselhos/[slug]`
  (detalhe: dados + **composição** em tabela + documentos por categoria com
  **Abrir PDF** em nova aba via `/api/conselhos/baixar/:id`).
- Admin: `/admin/conselhos` (CRUD do conselho + gestão de membros e de
  documentos/atas com MediaPicker). Item "Conselhos" no AdminShell e item público
  "Conselhos Municipais" no menu "Documentos Oficiais" (auto).

## Fase 4 — Concursos e Processos Seletivos (entregue)

Cadastro relacional (`api/src/modules/concursos/`, migration `db/031_concursos.sql`):
cada **concurso** tem um **tipo de certame** (seed `tipo_concurso.json`, 6) e
**documentos por fase**, tipados pela taxonomia oficial `concurso_tipo_documento`
(40 tipos agrupados por `situação`/fase — Abertura, Homologação… — com flag de
publicação obrigatória). Cada documento conta downloads.

- Público: `/concursos` (lista, filtros tipo/situação/ano/busca) e
  `/concursos/[slug]` (detalhe: dados + documentos agrupados por fase com **Abrir
  PDF** em nova aba via `/api/concursos/baixar/:id`).
- Admin: `/admin/concursos` (CRUD do certame + documentos; o seletor "Tipo de
  documento (TCE-MT)" lista os 40 com a fase e preenche fase+título). Item
  "Concursos" no AdminShell e item público "Concursos e Seletivos" no menu
  "Documentos Oficiais" (auto).

## Fase 5 — Contratos e Convênios (entregue, cadastros SEPARADOS)

Duas dimensões próprias do PNTP, em módulos separados:

- **Contratos e Aditivos** (`api/src/modules/contratos/`, migration
  `db/032_contratos.sql`): contrato com vínculo opcional à **licitação de
  origem**, contratado/CNPJ, valor, vigência, situação, **íntegra (PDF)** e
  **aditivos** (prazo/valor) — cada aditivo com arquivo e **contador de
  downloads**. Público `/contratos` + `/contratos/[slug]`; admin
  `/admin/contratos` (com seletor de licitação + gestão de aditivos).
- **Convênios e Transferências** (`api/src/modules/convenios/`, migration
  `db/033_convenios.sql`): concedente/convenente, valor de repasse,
  contrapartida, vigência e **documentos** (Termo, Plano de Trabalho, Prestação
  de Contas…), cada um com **contador de downloads**. Público `/convenios` +
  `/convenios/[slug]`; admin `/admin/convenios`.

Itens "Contratos" e "Convênios" no AdminShell; itens públicos no menu "Documentos
Oficiais" (auto). Download via `/api/contratos/baixar/:id`,
`/api/contratos/baixar-aditivo/:id` e `/api/convenios/baixar/:id` (302 + conta),
sempre em nova aba.

## Fase 6 — Seeding automático, Export e Migração (entregue)

- **Seeding no provisionamento**: `TenantProvisioningService` agora chama o
  `semearTenant` dos 6 cadastros (passo 6c, idempotente, isolado em try/catch) —
  todo município novo já nasce com as taxonomias TCE-MT e os itens de menu.
- **Export de dados abertos (CSV/JSON)**: cada listagem pública tem
  `GET …/export?formato=csv|json` (util `common/export/export.util.ts`, CSV com
  `;` + BOM para Excel pt-BR). Links "⬇ Planilha (CSV)" e "⬇ Dados (JSON)" em cada
  página pública. Rotas: `/api/documentos/:cadastro/export`,
  `/api/{licitacoes,conselhos,concursos,contratos,convenios}/export`.
- **Migração + redirects**: `POST /api/admin/documentos/_migrar-transparencia`
  reclassifica os documentos-tipo de `transp_documentos` para os cadastros
  estruturados (edital→Licitações, contrato→Contratos, concurso→Concursos;
  carta de serviços/LAI/estatístico→Documentos Diversos), **idempotente** e sem
  apagar o original — os financeiros (PPA/LDO/LOA/RGF/RREO/balanço/prestação)
  **permanecem** na Transparência financeira, como manda a classificação.
  **Redirects** de URL amigável em `next.config.mjs`: `/leis`→`/documentos/leis`,
  `/decretos`, `/portarias`, `/alvaras`, `/audiencias-publicas`… (307).

## Fase 7 — Cadastro manual de Tipos/Taxonomias (entregue)

Cada município pode **gerenciar manualmente** os tipos de cada cadastro (criar,
editar, ativar/desativar, excluir) — as taxonomias TCE-MT são o ponto de partida,
não uma camisa de força.

- Backend (CRUD admin, RBAC gestor/admin, slug gerado, dedup):
  - Documentos: tipos por cadastro (já existia) — `/api/admin/documentos/cadastros/:id/tipos`, `…/tipos/:id`.
  - Licitações: modalidades (com flags 8.666/14.133) e critérios — `/api/admin/licitacoes/{modalidades,criterios}[/todas|/:id]`.
  - Conselhos: tipos de conselho — `/api/admin/conselhos/tipos[/todas|/:id]`.
  - Concursos: tipos de certame e tipos de documento (com fase + obrigatório) —
    `/api/admin/concursos/{tipos,doc-tipos}[/todas|/:id]`. Tipos de documento
    manuais recebem código `M-xxxx` (não colidem com os do seed).
- Frontend: tela única **`/admin/tipos`** (item "Tipos e Taxonomias" no menu) com
  seletor agrupado por cadastro + tabela genérica (nome + campos extras + ativo) e
  formulário de novo/editar. Excluir falha graciosamente se o tipo estiver em uso
  → orienta a **desativar**.

## Fora de escopo (próximas rodadas)

- `destacar_menu` por tipo (promover um tipo a item de menu/rota próprios);
  importação automática direta dos sistemas do TCE (descartada a pedido).
- Migração/reclassificação do conteúdo de `/transparencia/documentos` com
  **redirecionamento** das URLs antigas (ver `classificacao-documentos.md`).
- Exportação **CSV/JSON** dos metadados nas listagens públicas; tipo promovido a
  menu próprio (`destacar_menu`) com rota dedicada.
- Seeding automático no provisioning de novos tenants
  (`TenantProvisioningService`) — hoje feito via `POST /api/admin/documentos/_semear`.
