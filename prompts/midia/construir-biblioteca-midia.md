# Prompt — Construir a Biblioteca de Mídia

> Cole este prompt no Claude Code na raiz do repositório (ou rode `/nova-feature biblioteca-midia` depois de salvar a spec). Ele assume o `CLAUDE.md` e os agents/skills do pacote.

---

Implemente a **Biblioteca de Mídia** da plataforma de ponta a ponta, seguindo o `CLAUDE.md` e delegando aos subagents certos. Comece escrevendo a spec em `specs/biblioteca-midia.md` e confirme comigo antes de codar a primeira migration.

## Objetivo

Um repositório único que **armazena e controla todas as mídias** do portal — imagens, fotos, documentos e arquivos —, organizado por **tipo** e **categoria**, com galeria no painel admin, componente de seleção reutilizável em todas as páginas que anexam mídia, e uma galeria separada e restrita para o cidadão (denúncias/documentos às secretarias).

## Princípios obrigatórios (não quebrar)

- **Fronteira de camadas:** frontend e app falam **só** com a API. Quem grava/lê o storage é **sempre o backend**. Nada de URL de upload assinada no cliente nem SDK de storage no web/mobile. Upload é multipart para a API.
- **Multi-tenant + RLS:** toda mídia pertence a um tenant; tabelas com `tenant_id` + RLS. A resolução de mídia é sempre escopada ao tenant (Host).
- **Acessibilidade (WCAG):** imagem exige **texto alternativo (alt)**; o picker obriga preencher alt ao usar uma imagem.
- **LGPD:** mídia enviada pelo cidadão pode conter dado pessoal (rosto, documento, GPS no EXIF). Tratar como dado restrito: base legal, minimização, retenção e acesso só interno. **Remover EXIF/GPS** de imagens públicas.
- **Auditoria:** upload, substituição, exclusão e acesso a mídia restrita gravam em `audit_log`.

## Conceitos

**Tipos** (enum `MediaType`): `imagem`, `documento`, `video`, `audio`, `outro`. O tipo é inferido do MIME validado no upload.

**Categorias** (`media_categories`, configuráveis por tenant): cada categoria pertence a um tipo e tem um `slug`. Seeds: `imagem` → {logos, brasoes, banners, noticias, galeria}; `documento` → {editais, leis, contratos, relatorios}; e categorias para mídia do cidadão: `imagem` → {denuncias} e `documento` → {protocolos}. O admin pode criar/editar categorias.

**Escopos de visibilidade** (`MediaVisibility`):
- `publico` — ativos do portal (logos, brasão, banners, editais). Têm **URL pública mascarada** servida pelo backend.
- `restrito` — mídia do cidadão, anexos de manifestação/chamado e documentos internos. **Sem URL pública**; acesso só por endpoint autenticado, com RLS + RBAC + ownership/destino.

## Armazenamento (storage)

- Backend grava no object storage (MinIO/S3 — ver `docs/12-infraestrutura.md`). **Não** salvar binário no banco.
- **Nome mascarado:** ao subir `logo.svg` ou `brasao.svg`, gere um token aleatório (ex.: nanoid/hex 21+ chars), preserve a extensão validada e guarde o `nome_original` nos metadados.
- **Layout interno** (nunca exposto): `s3://{bucket}/{tenantId}/{tipo}/{categoria}/{hash}.{ext}`.
- **Dedup opcional:** `checksum` SHA-256 por tenant+categoria; se idêntico, reaproveitar o objeto.

## Rota pública mascarada (somente escopo `publico`)

Exponha a URL no formato **`/midia/[tipo]/[categoria]/[hash].[extensão]`**.

Exemplo: `logo.svg` (categoria `logos`) vira `https://<dominio-da-prefeitura>/midia/imagem/logos/09h7789ahhdiochdpaueh.svg`.

- É uma **rota do backend**: resolve `(tenant pelo Host, tipo, categoria, hash)` → confere `visibilidade = publico` → faz **stream** do objeto (ou redireciona via URL assinada interna de curta duração) sem nunca revelar o caminho real do storage.
- Cache forte (`Cache-Control: public, immutable`) — o hash garante imutabilidade; trocar o arquivo gera novo hash/URL.
- Bloquear path traversal e enumeração; 404 genérico para hash inexistente ou mídia não pública.

## Modelo de dados (delegar ao `dba-postgres-rls`)

`media_assets`: `id`, `tenant_id`, `tipo`, `categoria_id`, `visibilidade`, `nome_original`, `hash` (nome mascarado), `ext`, `mime`, `tamanho_bytes`, `largura`/`altura` (imagens), `checksum`, `alt_text`, `storage_key`, `uploaded_by`, `created_at`. Índices por `(tenant_id, tipo, categoria_id)` e único `(tenant_id, tipo, categoria_id, hash)`. RLS por tenant.

`media_categories`: `id`, `tenant_id`, `tipo`, `nome`, `slug`, `descricao`. Único `(tenant_id, tipo, slug)`. RLS.

**Unificar o que já existe:** `manifestacao_anexos` (db/004) e `chamado_fotos` (db/005) passam a referenciar `media_assets` (FK), todos `restrito`. A biblioteca é a fonte única de "todas as mídias".

## Backend (delegar ao `backend-nestjs`)

Módulo `MediaModule` com:
- `POST /api/midia` — **multipart**: valida tipo/tamanho/MIME, gera hash, (imagens) extrai dimensões e remove EXIF, grava no storage, persiste metadados. Body: `{ categoriaId, visibilidade, altText? }`.
- `GET /api/midia` — lista paginada com **filtros por tipo e categoria** + busca por nome; retorna miniatura/URL conforme escopo.
- `GET /api/midia/:id` — metadados completos (tamanho, mime, dimensões, categoria, URL pública quando aplicável).
- `GET /midia/:tipo/:categoria/:arquivo` — **serve o público mascarado** (acima).
- `GET /api/midia/privado/:id` — serve mídia `restrito`: exige auth + RBAC + RLS + checagem de ownership/destino; sem cache; registra acesso em `audit_log`.
- `PUT /api/midia/:id` (alt/categoria), `DELETE /api/midia/:id` (com auditoria).
- Endpoints de `media_categories` (CRUD) para o admin.
- `StorageService` isolando o SDK do MinIO/S3 (credenciais só no backend). Validação de MIME real (magic bytes), antivírus quando disponível.

## Galeria do admin (delegar ao `frontend-nextjs`)

- **Filtros** por tipo e categoria + busca; grid de **miniaturas**.
- Clique abre **modal**: à esquerda **preview** — imagem renderizada quando possível; para documentos/outros, **ícone por extensão** (pdf, docx, xlsx, etc.); à direita **detalhes/metadados**: nome original, tipo, categoria, tamanho, dimensões, MIME, data, e **caminho público (URL da rota mascarada)** com botão copiar (só para `publico`).
- Ações: editar alt/categoria, excluir, fazer upload (aba de upload no mesmo modal).
- Acessível (WCAG): navegação por teclado, foco, alt nas miniaturas.

## Componente reutilizável `<MediaPicker>` (frontend)

Usado em **todas as páginas do admin que anexam mídia** (logo/brasão do tema → skill `tema-wcag`; blocos do CMS → `cms-dinamico`; notícias; editais; etc.):
- Abre um modal com duas abas: **Galeria** (mesmos filtros/miniaturas) e **Upload** (envia via API e já seleciona).
- Retorna a referência do `media_asset` (id + URL pública mascarada quando `publico`). Para imagem, **exige alt**.
- O tema passa a guardar a **URL mascarada** do logo/brasão (em vez de caminho fixo).

## Galeria do cidadão (transparente e restrita)

Para o cidadão (app/web), em denúncias e envio de documentos a entidade/secretarias:
- **Apenas upload:** escolher arquivo **ou abrir a câmera** (quando fizer sentido) e **enviar**. Sem navegação por acervo de terceiros, sem filtros, sem galeria pública.
- Tudo é `restrito`: **não há rota pública externa**. O arquivo só é acessível no **controle interno** correspondente (a manifestação/chamado ou a secretaria de destino), por usuários autorizados, via `GET /api/midia/privado/:id` com RLS + RBAC + ownership/destino.
- Vincular cada upload ao registro de origem (manifestação/chamado) e/ou à secretaria destinatária; o cidadão só vê/gerencia os próprios envios.
- Upload pelo backend (multipart), offline-first no app (fila local). Aplicar minimização/EXIF conforme LGPD.

## Segurança & LGPD (revisar com `seguranca-devsecops` e `lgpd-gdpr-dpo`)

Validação de MIME real e tamanho; antivírus; bloqueio de path traversal/enumeração; mídia `restrito` nunca cacheada nem indexável; EXIF/GPS removido do que é público; base legal, finalidade, **retenção** e expurgo da mídia do cidadão documentados; auditoria de acesso a mídia restrita.

## Testes (delegar ao `qa-testes`)

- Isolamento RLS de `media_assets` e `media_categories` (tenant A ≠ B).
- A rota pública só serve `publico`; mídia `restrito` **não** é acessível por nenhuma URL pública (teste negativo).
- Mascaramento: o caminho real do storage nunca aparece na resposta; hash inexistente → 404 genérico.
- Cidadão acessa só os próprios envios; secretaria de destino acessa os direcionados a ela.
- Filtros por tipo/categoria; preview x ícone por extensão; alt obrigatório em imagem.

## Ordem de execução

1. `tech-writer`: spec `specs/biblioteca-midia.md` (confirmar comigo).
2. `dba-postgres-rls`: migration `db/NNN_media_library.sql` (tabelas + RLS + FKs de anexos/fotos) + teste de isolamento.
3. `backend-nestjs`: `MediaModule`, `StorageService`, rotas (pública mascarada + privada autenticada), validação/EXIF/antivírus.
4. `frontend-nextjs`: galeria admin + `<MediaPicker>` + integração no tema/CMS/notícias.
5. Fluxo do cidadão (app/web) upload-only + câmera, vinculado a manifestação/chamado.
6. `seguranca-devsecops` + `lgpd-gdpr-dpo`: auditoria.
7. `qa-testes`: suíte acima. `tech-writer`: atualizar docs/spec.

## Critérios de aceite

- Upload por tipo/categoria com nome mascarado; URL pública no formato `/[tipo]/[categoria]/[hash].[ext]` servida pelo backend, sem expor o caminho real.
- Galeria admin com filtros, miniaturas, modal (preview/ícone) e metadados incl. URL pública.
- `<MediaPicker>` disponível e usado nas páginas que anexam mídia, com aba de upload.
- Galeria do cidadão upload-only (arquivo/câmera), 100% restrita, acessível só no controle interno.
- RLS, segurança, LGPD e acessibilidade cobertos por teste; CI verde.

## Fora de escopo (a menos que eu peça)

Edição de imagem (crop/resize) no navegador; versionamento de arquivos; CDN externa; transcodificação de vídeo.
