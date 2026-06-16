# Assistente de IA — Base de conhecimento e recuperação (RAG) em 4 camadas

> Como o chatbot do portal "aprende" a responder sobre cada entidade. Multi-tenant
> (RLS): cada prefeitura tem o seu próprio conhecimento, isolado. Migrations 053 e 054.
>
> **Status (2026-06-13):** as 4 camadas estão IMPLEMENTADAS e EM PRODUÇÃO. A camada 4
> (busca semântica) está **ATIVA** com a Voyage AI — não é mais "só falta a chave".

## Visão geral

O assistente (usado em `/assistente`, no widget de atendimento e no bot omnichannel)
responde **ancorado no conteúdo oficial** daquela prefeitura. A recuperação de contexto
é montada em **3 camadas**, da mais autoritativa à mais ampla:

| Camada | Fonte | Como entra no contexto |
|---|---|---|
| **1. Fatos da entidade** | `tenants` (nome/UF), `secretarias` (nome/responsável/horário/contato), DPO (`dpo_nome/email`) | **Sempre** injetado, como "INFORMAÇÕES OFICIAIS DA ENTIDADE" — o bot afirma nome da cidade, telefones, horários com confiança. Cache por tenant (TTL 5 min). |
| **2. Base de conhecimento curada** | `ia_conhecimento` (perguntas/respostas oficiais cadastradas pelo gestor) | `fixados` (sempre) + busca FTS pela pergunta → "RESPOSTAS OFICIAIS CADASTRADAS" (prioridade máxima). É o "treinar" controlado pelo gestor. |
| **3. RAG multi-fonte** | CMS (páginas/blocos), **Serviços**, **Notícias**, **Secretarias**, **Documentos do SIC** (full-text do conteúdo extraído) | Busca FTS em todas as fontes do tenant → "CONTEÚDO DO PORTAL" com citações (título/URL). |

Tudo isolado por tenant via RLS (`this.prisma.db`/`$queryRaw`). Sem PII de cidadão no
contexto — só dado institucional/público.

## "Treinar" o bot (camada 3) — `/admin/ia-conhecimento`

O gestor (GESTOR/ADMIN_PREFEITURA) cadastra **pergunta + resposta oficial**, com:
- **Fixado**: o item é sempre considerado pelo bot (use para identidade da entidade e
  contatos principais).
- **Ativo/Inativo**: liga/desliga sem apagar.
- **Tags**: organização.

Endpoints: `GET/POST /api/admin/ia/conhecimento`, `PUT/DELETE /api/admin/ia/conhecimento/:id`.
Use para: respostas frequentes, informações específicas que não estão em página, e para
**corrigir** respostas ruins do bot.

## Detalhe técnico — recall na busca FTS

A recuperação usa `to_tsquery('portuguese', '<termo1> | <termo2> | …')` (OR), montado por
`tsqueryOr()` a partir das palavras relevantes da pergunta (remove acentos — o stemmer
português gera o mesmo lexema — e stopwords). Isso dá **recall** real: uma pergunta
conversacional ("Como falo com o Procon? Tem telefone?") casa com o conteúdo que tem
"procon" e "telefone", sem exigir todas as palavras (o `plainto_tsquery`, que usa AND,
falhava nesses casos). Ordenação por `ts_rank`.

## Multi-tenant — pronto para novas entidades

Ao provisionar uma nova prefeitura, o bot **já nasce sabendo** sobre ela, sem nenhuma
configuração: as camadas 1 e 2 leem os dados e o conteúdo do próprio tenant (RLS). A base
curada (camada 3) começa vazia e é preenchida pelo gestor conforme a operação. Não há
nada hardcoded por entidade.

## Camada 4 — busca semântica (embeddings + pgvector) — ATIVA EM PRODUÇÃO

Entende sinônimos/paráfrases (não só palavras). **Implementada, deployada e ATIVA**
(migration 054 + pgvector na imagem do Postgres + chave Voyage configurada). Já indexa e
responde por similaridade — validada ao vivo na Exemplolândia (57 chunks, 6 fontes).

- **pgvector**: a imagem do banco é `portal-postgres-pgvector:16` (`infra/postgres-pgvector/`),
  PostGIS 3.4 + pgvector 0.8.2. Extensão `vector` criada.
- **Corpus unificado** `ia_chunks` (migration 054): chunks de TODAS as fontes (CMS,
  serviços, notícias, secretarias, documentos e a própria base de conhecimento) +
  `embedding vector(1024)` + índice HNSW cosine, RLS por tenant.
- **EmbeddingsService multi-provedor**: Voyage AI (`voyage-3`) ou OpenAI
  (`text-embedding-3-small`, `dimensions=1024`). `configurado` = há `VOYAGE_API_KEY` OU
  `OPENAI_API_KEY`. Padronizado em **1024 dimensões**.
- **Indexador** (`IaIndexadorService`): chunk (~800 chars, overlap 100) → embed em lotes →
  upsert em `ia_chunks` por (tenant, fonte, ref_id, chunk_idx). Roda em job BullMQ
  (`JOB_IA_REINDEX` na fila `ia`).
- **`recuperar()`**: se configurado, embeda a pergunta e busca `ia_chunks` por
  `embedding <=> $consulta::vector` (cosine, top 6); senão **degrada** para o FTS
  multi-fonte. Nada quebra sem chave.
- **Admin**: `GET /api/admin/ia/index-status` (status/contagens), `POST /api/admin/ia/reindexar`
  (enfileira a reindexação) + painel na tela `/admin/ia-conhecimento`.

### Estado operacional (o que já está configurado)
- Provedor **Voyage AI** (`EMBEDDINGS_PROVIDER=voyage`, `EMBEDDINGS_MODEL=voyage-3`,
  `VOYAGE_API_KEY=...`) no `portal.env` e `.env.prod`. `portal-api` já recriado.
- Corpus da Exemplolândia indexado: **57 chunks** em 6 fontes.
- Para uma **nova entidade**: basta clicar **"Reindexar agora"** em `/admin/ia-conhecimento`
  (ou `POST /api/admin/ia/reindexar`) — o corpus dela é vetorizado e isolado por RLS.

> Trocar de provedor/modelo muda o lexema → **reindexe** após trocar. O custo de
> embeddings é baixo (poucos centavos por reindexação de um portal municipal típico).

### Pendências operacionais (não-bloqueantes)
- **Rotacionar a chave Voyage** — a chave atual foi exposta em chat durante a ativação.
- **Adicionar forma de pagamento no dashboard Voyage** — o free tier sem cartão fica em
  3 RPM / 10K TPM (o indexador tem retry/backoff e conclui, mas devagar). Adicionar cartão
  **continua grátis até 200M tokens** e destrava o rate limit (reindex rápido).

## Isolamento multi-tenant da camada vetorial — PROVADO empiricamente

A busca semântica **não mistura entidades**, e isso foi verificado na prática (não só por
design) em 2026-06-13. Teste rodado no banco de produção **como o papel `portal_app`** (o
mesmo da API: `NOSUPERUSER`/`NOBYPASSRLS`):

1. Criada uma 2ª entidade com um trecho-isca cujo **vetor era o mais próximo possível** da
   consulta (se houvesse vazamento, apareceria em 1º lugar).
2. **Contexto entidade A:** vê só os 57 chunks dela; o trecho-isca da entidade B **não
   aparece**, mesmo sendo o vizinho mais próximo.
3. **Contexto entidade B:** vê só o próprio trecho (1 chunk).
4. **Sem contexto de tenant:** vê 0 chunks (fecha por padrão).

Por quê: o Postgres aplica o RLS (`WHERE tenant_id = <atual>`) **antes** de ordenar por
`embedding <=> consulta`. O vetor da outra entidade nunca entra no conjunto a ser ranqueado
— a IA não "vê e ignora", ela simplesmente não recebe. Vale para as 4 camadas (todas via
`prisma.db`). Para reproduzir o teste, ver a memória `ia-base-conhecimento` (sessão).

## Requisitos

- Flag por tenant `tenants.ia_chat_habilitada` ligada + `ANTHROPIC_API_KEY` no ambiente
  (o modelo é `IA_MODEL` ou o default).
- LGPD: contexto só com dado institucional; auditoria sem conteúdo sensível.
