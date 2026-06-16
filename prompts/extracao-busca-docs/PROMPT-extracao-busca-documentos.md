# Prompt — Extração de texto + busca semântica de documentos

> Cole no **Claude Code** no repositório `D:\Site\portal-prefeitura`. Use com `arquitetura-extracao-busca.md` (mesmo pacote). Objetivo: ler os documentos do portal, **extrair o texto**, **indexar** e oferecer **busca semântica (híbrida + rerank)** — em massa no início e por **botão** depois. **Documente tudo.**

---

## Persona

Você é **engenheiro backend sênior** (NestJS 10 + PostgreSQL 16 + Prisma + **BullMQ/Redis 7** + biblioteca de mídia) com experiência em **OCR**, **pipelines de NLP**, **embeddings/busca vetorial** e **multi-tenant**. Conhece as **regras invioláveis** do portal.

## Tarefa

Construir um módulo que, para os documentos da plataforma (Leis, Decretos, Portarias, Licitações, Contratos, etc. — PDF/DOC/DOCX/ODT/XLS), faça:
1. **Extração de texto** em pipeline por custo (nativo → Tesseract → Claude visão como fallback).
2. **Indexação** para **busca por palavra-chave** (Postgres FTS pt-BR) **e** **vetorial** (Voyage + pgvector).
3. **Busca híbrida** (FTS + vetorial) com **rerank da Voyage**, exposta no portal.
4. **Exibição** do texto no portal (acessível), mantendo o **arquivo original** para download.
5. Operação **em massa (backfill)** e **por botão** (re-extrair sob demanda), além de **automático no upload**.

Toolchain disponível: **Tesseract** (local), **Claude API** (visão/limpeza), **VoyageAI** (embeddings + rerank), **pgvector** no Postgres existente. Detalhes em `arquitetura-extracao-busca.md`.

## Regras invioláveis (não violar)

- **Fronteira de camadas:** só o backend/worker fala com storage, Claude e Voyage; o front **nunca**. Tudo via **API**.
- **Multi-tenant + RLS:** `document_text` e `document_chunk` entram com `tenantId` e **política RLS**; usar role de app **NOSUPERUSER NOBYPASSRLS** (não rodar com superusuário). **Toda busca filtra por tenant** e respeita o **nível de acesso** do documento (não vazar restrito ao público).
- **Filas idempotentes (BullMQ):** reutilizar a infra existente, **sem** mexer nos prefixos Redis reservados; jobs idempotentes por `documentId + sourceHash`.
- **LGPD:** Claude e Voyage **processam o conteúdo** → usar **retenção zero (ZDR)** onde houver; **não** enviar documento **restrito** a API externa sem avaliação; **minimizar** o que é enviado. **Auditoria** da extração no `audit_log`.
- **Acessibilidade (WCAG AA):** texto extraído renderizado de forma acessível; **rotular** como *"extraído automaticamente, pode conter imprecisões"*; **original é a fonte de verdade** (nunca tratar OCR/IA como texto legal autêntico).

## O que construir

1. **Pipeline de extração (worker):**
   - Detectar camada de texto (PDF) → `pdftotext`/Tika; DOC/DOCX/ODT/XLS → Tika/libreoffice/mammoth.
   - Escaneado → `pdftoppm` + **Tesseract pt-BR**; medir confiança.
   - Confiança baixa → **Claude (visão)** como *fallback*, pedindo **transcrição verbatim** (sem resumir, sem inventar) das páginas ruins.
   - (Opcional, configurável por tenant/tipo) **Claude** para limpar o OCR e **extrair metadados** (ementa, número, data, órgão) + resumo curto.
   - Gravar `document_text` (texto, `method`, `confidence`, `status`, `language`, `sourceHash`).
2. **Indexação:**
   - **Chunking** (~512–1000 tokens, com overlap, respeitando parágrafo/artigo para texto legal).
   - **Voyage embeddings** → `document_chunk.embedding` (**pgvector**, dimensão = modelo escolhido).
   - **FTS pt-BR** (`tsvector` + índice GIN) para palavra-chave.
3. **Busca híbrida:** FTS + vetorial (cosine) → **fusão (RRF)** → **rerank Voyage** → resultados com **snippets destacados**. Endpoint `GET /api/busca?q=...` (global) e busca por módulo. Sempre por **tenant** + **nível de acesso**.
4. **Gatilhos (mesma fila):**
   - **Automático no upload** (criar/atualizar arquivo).
   - **Backfill em massa:** comando/endpoint que enfileira **todos** os documentos — paginado, **throttled**, **resumível**, idempotente.
   - **Botão admin:** `POST /api/documentos/:id/extrair` (re-extrair/forçar).
   - Job `document:embed` separado, para **re-embeddar** sem re-OCR quando o texto/modelo mudar.
5. **Exibição no portal:** aba **"Conteúdo/Texto"** na página do documento (acessível, pesquisável), com o **original** disponível para download e o rótulo de extração automática.

## Config (placeholders — **não commitar valores reais**)

```dotenv
ANTHROPIC_API_KEY=__secret__
ANTHROPIC_MODEL=__confirmar_modelo_atual__
VOYAGE_API_KEY=__secret__
VOYAGE_EMBED_MODEL=__multilingue_geral__      # testar modelo jurídico no acervo
VOYAGE_EMBED_DIM=1024                          # DEVE casar com vector(N) da coluna
VOYAGE_RERANK_MODEL=__rerank_atual__
OCR_LANG=por
OCR_TEXT_DENSITY_MIN=__limiar__
OCR_TESSERACT_CONF_MIN=__limiar__
```
> **Confirme na doc atual** os nomes de modelo (Anthropic e Voyage) e a **dimensão** do embedding — a dimensão precisa **casar com a coluna `vector(N)`**. Trocar de modelo com outra dimensão exige **migração + re-embeddar**.

## Como trabalhar

1. **Migração**: habilitar `pgvector`; criar `document_text` e `document_chunk` (com `embedding vector(N)`, `tsv tsvector`, índices HNSW + GIN + `(tenant_id, document_id)`) e **políticas RLS**.
2. Implementar o **worker de extração** (camadas por custo) + **detecção/limiar** nativo↔OCR↔Claude.
3. Implementar **chunking + embeddings (Voyage)** e o **FTS**.
4. Implementar a **busca híbrida + rerank** e os endpoints.
5. Implementar os **gatilhos** (upload, backfill, botão) e o `document:embed`.
6. Implementar a **aba de texto** no portal + integração na busca do site.
7. **Testes obrigatórios:**
   - **Isolamento por tenant** (tenant A não busca/recupera texto nem vetores de B).
   - **Nível de acesso** (documento restrito não aparece para o público).
   - **Idempotência** (re-rodar não duplica chunks; re-embed substitui).
   - **Dimensão** do vetor casa com o modelo; extração falha vira `needs_review` (não derruba o worker).
   - Amostra de qualidade: 1 PDF com texto, 1 PDF escaneado, 1 DOCX.

## Critérios de aceite

- Documentos com texto extraído (`status=extracted`), **método registrado**, e **chunks embeddados** no pgvector + **FTS** populado — tudo **por tenant (RLS)**.
- **Busca híbrida + rerank** funcionando no portal, filtrada por **tenant** e **nível de acesso**, com snippets.
- **Backfill em massa** resumível/idempotente + **botão** de re-extração + **automático no upload**.
- Camadas por custo respeitadas (nativo→Tesseract→Claude); **embedda uma vez**, re-embed só on-change.
- **Aba de texto** acessível, rotulada, com original para download.
- **Só-API, RLS/tenant, fila idempotente, LGPD/ZDR, auditoria** respeitados; **sem segredos em log**.

## Documentação (obrigatória)

`docs/extracao-busca/`: visão geral, **ADRs** (pgvector vs vector DB externo; busca híbrida + rerank; OCR em camadas; escolha de modelo/dimensão Voyage e implicação de re-embed), **esquema/migração**, contrato dos endpoints (extração/busca), **runbook** (rodar backfill; re-extrair; **trocar modelo Voyage → re-embeddar**; limiares de OCR), e **notas de conformidade/acessibilidade**. Atualizar README e `.env.example` (placeholders).

## Fora de escopo (nesta fase)

- **RAG / "pergunte aos documentos"** (Q&A com citações) — fase posterior; aqui é **extração + indexação + busca semântica**.
- Não duplicar regra de negócio no front/app; OCR/IA **não** substitui o documento original.
