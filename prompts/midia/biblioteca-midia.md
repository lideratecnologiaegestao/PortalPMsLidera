# Spec — Biblioteca de Mídia

## 1. Objetivo
Repositório único que armazena e controla **todas as mídias** do portal (imagens, fotos, documentos, arquivos), organizado por tipo e categoria, com galeria no admin, componente de seleção reutilizável e uma galeria restrita para o cidadão.

## 2. Conformidade legal
LGPD: mídia do cidadão é dado restrito (base legal, minimização, retenção, acesso só interno; EXIF/GPS removido do que é público). Acessibilidade (WCAG): imagem exige texto alternativo.

## 3. Requisitos funcionais
1. Upload por **tipo** (`imagem|documento|video|audio|outro`) e **categoria** (configurável por tenant).
2. **Nome mascarado** no storage; URL pública no formato `/midia/[tipo]/[categoria]/[hash].[ext]` servida pelo backend, sem expor o caminho real.
3. **Galeria admin:** filtros por tipo/categoria + busca, miniaturas, modal com preview (imagem) ou ícone por extensão, painel de metadados (tamanho, mime, dimensões, URL pública).
4. **`<MediaPicker>`** reutilizável em todas as páginas que anexam mídia (tema/logo, CMS, notícias, editais), com aba galeria + upload.
5. **Galeria do cidadão:** upload-only (arquivo ou câmera) e enviar; sem rota pública; acesso só no controle interno (manifestação/chamado/secretaria).
6. CRUD de categorias no admin.
7. Unificar `manifestacao_anexos` e `chamado_fotos` sobre `media_assets`.

## 4. Não-funcionais
Upload via API (multipart) — só o backend toca o storage; validação de MIME real + tamanho; dedup por checksum; cache imutável para público; mídia restrita nunca cacheada/indexável; auditoria de acesso a restrita.

## 5. Modelo de dados
`media_categories` (tenant_id, tipo, slug único por tipo) e `media_assets` (tenant_id, tipo, categoria, visibilidade, nome_original, hash, ext, mime, tamanho, dimensões, checksum, alt_text, storage_key, uploaded_by). RLS por tenant. Ver `db/006_media_library.sql`.

## 6. Contrato de API
- `POST /api/midia` (admin) — multipart `{categoriaId, visibilidade, altText?}`.
- `GET /api/midia?tipo=&categoria=&q=&page=` (admin) — lista/filtra.
- `GET /api/midia/:id` (admin) — metadados.
- `PUT /api/midia/:id` / `DELETE /api/midia/:id` (admin) — editar alt/categoria / excluir (auditado).
- `GET /api/midia/categorias` + CRUD (admin).
- `POST /api/midia/cidadao` (cidadão, multipart) — upload restrito vinculado a manifestação/chamado/secretaria.
- `GET /api/midia/privado/:id` — serve restrita (auth + RBAC + RLS + ownership/destino; sem cache; auditado).
- `GET /midia/:tipo/:categoria/:arquivo` — **público mascarado** (fora do prefixo `/api`).

## 7. Fluxos
Upload admin → valida/mascara/grava no storage → metadados → URL pública (se `publico`). Cidadão → upload-only → restrito → visível só no controle interno. Resolução pública → backend faz stream sem revelar storage_key.

## 8. Integrações
Object storage (MinIO/S3 via `StorageService`); módulos consumidores: tema (`tema-wcag`), CMS (`cms-dinamico`), manifestações, chamados.

## 9. LGPD/GDPR
Mídia do cidadão: base legal (interesse público/obrigação legal), minimização, retenção por finalidade, sem URL pública, log de acesso. Remoção de EXIF/GPS no escopo público.

## 10. Critérios de aceite
- Nome mascarado e URL `/[tipo]/[categoria]/[hash].[ext]` sem vazar storage_key (teste).
- Galeria com filtros/preview/ícone/metadados; `<MediaPicker>` em uso.
- Cidadão upload-only 100% restrito; mídia restrita inacessível por qualquer URL pública (teste negativo).
- Isolamento RLS de `media_assets`/`media_categories`; alt obrigatório em imagem; CI verde.

## 11. Fora de escopo
Edição de imagem no navegador, versionamento, transcodificação de vídeo, CDN externa.
