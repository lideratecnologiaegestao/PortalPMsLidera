# ADR-0004 — Buscador Unificado: índice materializado FTS com sync por worker

- **Status:** Aceito
- **Data:** 2026-06-14
- **Migration:** `db/060_busca_unificada.sql`
- **Módulo:** `api/src/modules/busca/`

## Contexto

A plataforma serve ~13 categorias de conteúdo público por tenant (notícias, documentos/leis/decretos/portarias, páginas CMS, secretarias, serviços, transparência documental, Diário Oficial, licitações, conselhos, concursos, contratos, convênios). O cidadão precisa de um único campo de busca que retorne resultados ranqueados de todas as fontes, com snippet e link, respeitando isolamento multi-tenant e LGPD.

Restrições: NUNCA indexar manifestações/ouvidoria/e-SIC, usuários, chamados, atendimento/chat, formulário_envios, `transp_folha`, `transp_divida_ativa`, `transp_terceirizados`, mídia/cadastros `restrito`. Isolamento absoluto por tenant (RLS). Busca sem autenticação (conteúdo público). PostgreSQL 16, `unaccent`/`pg_trgm` já instalados, FTS `portuguese`.

## Decisão

**Índice materializado `search_index`** (tabela com `corpo_tsv tsvector` + GIN, `snippet_src` pré-recortado), alimentado por **worker BullMQ** (fila `QUEUE_BUSCA`), com enfileiramento nos services existentes após cada write e um job periódico de varredura/cleanup como rede de segurança. Busca **FTS lexical** na v1 (`websearch_to_tsquery('portuguese', unaccent(...))` + `ts_rank_cd` × peso por tipo + `ts_headline`). Híbrido pgvector fica para v2 (re-rank dos top-N, sem mudar a API).

**Filtro LGPD/visibilidade aplicado na INDEXAÇÃO** (o worker só insere conteúdo público; ao despublicar/restringir, remove do índice). Na leitura, **RLS** garante o tenant. Dupla camada.

Rejeitados: UNION em tempo de query (ranking cross-tipo inconsistente, paginação incorreta); triggers SQL (conflito com `trg_materia_imutavel` do Diário, dispara antes do commit); Elastic/OpenSearch externo (custo/operacional).

## Contrato da API

`GET /api/busca?q=<2..200>&tipo=<opcional>&page=1&pageSize=10` (público, passa pelo TenantMiddleware → RLS). Resposta:
```
{ total, page, pageSize, resultados: [{ tipo, refId, titulo, snippet(html só <b>), url, score, publicadoEm? }] }
```
Rate limit no Nginx (zona `general`/`api`).

## Fontes indexadas (tipo → tabela → filtro público → url)
noticia(`noticias`,`publicado`,`/noticias/{slug}`) · documento(`documentos`+`doc_cadastros`,`ativo` AND cad.`visibilidade='publico'`,`/documentos/{cadastro}/`) · diario(`diario_materias` JOIN edicao `status='publicado'`,`/diario/materia/{id}`) · servico(`servicos`,`publicado`,`/servicos/{slug}`) · secretaria(`secretarias`,`ativo`,`/secretarias/{slug}`) · cms(`cms_pages`+blocks,`publicado`,`/{slug}`) · transparencia(`transp_documentos`,público,`/transparencia/{categoria}`) · licitacao/contrato/convenio/conselho/concurso(`ativo`,`/{modulo}/{slug}`).

## Excluídos (LGPD): manifestacoes/manifestacao_*, users/user_*, chamados, atendimento_*, chat_*, formulario_envios, transp_folha, transp_divida_ativa, transp_terceirizados, solicitacoes_titular, incidentes_seguranca, audit_log, ia_conhecimento, media_assets/doc_cadastros `restrito`, banners, galeria.

## Sincronização
`BuscaSyncService.enqueue(tipo, refId)` chamado fire-and-forget pelos services após write → `QUEUE_BUSCA` job `JOB_BUSCA_SYNC_ITEM` → worker valida visibilidade e faz upsert/delete no `search_index` (padrão do `DocumentosFtsWorker`: TenantContext.run + dead-letter). Backfill: `JOB_BUSCA_REINDEX_TENANT`. Cleanup de órfãos: cron 10min + `JOB_BUSCA_CLEANUP_ORPHANS`.

## Frontend
`web/app/busca/page.tsx` (hoje só notícias) passa a chamar `GET /api/busca`; `getBusca()` em `lib/portal-api.ts` (padrão `?__h`); resultados agrupados/ranqueados com snippet (sanitizar `<b>`), filtro por tipo, paginação. `SearchBar` no header já existe.

## Consequências
+ Ranking cross-tipo real, snippet rápido, isolamento LGPD estrutural (na escrita) + RLS (leitura), reuso do padrão BullMQ/TenantContext. − Consistência eventual (<5s; cleanup cobre). Teste de isolamento RLS obrigatório (tenant A não vê B).
