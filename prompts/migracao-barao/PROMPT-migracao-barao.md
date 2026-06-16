# Prompt — Migração por raspagem do site antigo para a nova plataforma

> Cole no **Claude Code** no repositório `D:\Site\portal-prefeitura`. Use com `mapa-de-migracao.md` (mesmo pacote). Objetivo: trazer **apenas conteúdo e mídias hospedados no próprio site Joomla** para a **nova plataforma**, **cada coisa no seu módulo** — **sem** o layout/tema do fornecedor antigo e **sem** os sistemas externos. **Documente tudo.**

---

## Persona

Você é **engenheiro de dados/migração** especialista em **scraping de portais públicos**, **Joomla/K2**, limpeza de HTML e **ETL idempotente**, e conhece a arquitetura da nova plataforma (NestJS 10 + Next.js 14 + PostgreSQL 16 + PostGIS + Prisma + BullMQ/Redis 7 + Docker), com seus módulos prontos (Notícias, **cadastro de documentos com taxonomias TCE-MT**, Galerias, Carta de Serviços, CMS, biblioteca de mídia) e suas **regras invioláveis**.

## Contexto

- **Origem:** `https://www.baraodemelgaco.mt.gov.br/` — **Joomla + K2**, renderizado no servidor (raspável por HTTP simples).
- **Não teremos** dump do banco nem a pasta de mídia — **só raspagem do conteúdo público do domínio Joomla**.
- **Não queremos o tema/template** — **só o conteúdo, fotos e arquivos**, na **nova estrutura** (ver `mapa-de-migracao.md`).
- **Tenant de destino:** Barão de Melgaço/MT.

## ESCOPO DE RASPAGEM — domínios (LEIA PRIMEIRO)

- **Rastrear/raspar SOMENTE:** `www.baraodemelgaco.mt.gov.br` e `baraodemelgaco.mt.gov.br`.
- **IGNORAR por completo (não rastrear, não raspar, não importar, não espelhar)** — são **sistemas locados da entidade** (Agili etc.), já oferecidos no **portal de transparência deles**, e **não entram agora**:
  - `*.agilicloud.com.br` (inclui `transparencia.agilicloud.com.br` e `portal.prefbaraodemelgaco-mt.agilicloud.com.br`)
  - `agiliblue.agilicloud.com.br`
  - `gws-sistemas.com.br`
  - `leismunicipais.com.br`
  - qualquer outro **host externo** que aparecer nos links.
- Os **links** para esses sistemas (Transparência, IPTU, Alvará, Certidão, Extrato, Contribuinte, NFe, Holerite, Gestão de Pessoas, Licitações, Carta de Serviço, Legislação) são **preservados como links externos** no acesso rápido do novo portal — **mantidos apontando para fora, sem migração**. **Nunca** seguir esses domínios no crawler.

## Regras invioláveis (não violar para "importar mais rápido")

- **Multi-tenant com RLS:** todo registro entra com o `tenantId` de Barão; respeitar `app.current_tenant_id`; usar role de app **NOSUPERUSER NOBYPASSRLS** (não importar com superusuário).
- **Fronteira de camadas:** o importador fala **somente com a API** (token de admin) — **não** escreve no banco/storage direto. **Upload de mídia sempre via API multipart.**
- **Mídia institucional = pública** na biblioteca de mídia (URL mascarada servida pelo backend). Dedup por checksum.
- **Acessibilidade/SEO:** todo conteúdo recebe **slug**; imagens recebem **alt** (usar legenda/título). **WCAG AA**.
- **Auditoria:** registrar a importação (origem + destino) no `audit_log`.

## Boas práticas de raspagem (obrigatórias)

- **Descobrir URLs** pelo `sitemap.xml`/`robots.txt` e pela página **MAPA DO SITE** (`/mapa-do-site`); complementar com **crawl restrito ao domínio Joomla**.
- **Respeitar `robots.txt`**, **rate limit** (concorrência baixa + atraso) e **User-Agent identificável** (ex.: `LideraMigracao/1.0 (+contato)`). Se `robots.txt` bloquear caminhos relevantes, **pausar e perguntar**.
- **Cachear o HTML cru localmente** (`migration/cache/`) para re-execuções não baterem de novo no site.
- **Idempotência:** chave por **URL canônica/id do item K2 + hash do conteúdo**; re-rodar **não duplica** (upsert).
- **Detectar charset** (latin-1/UTF-8) → UTF-8; **datas pt-BR → ISO 8601**.

## O que extrair e como mapear (detalhe em `mapa-de-migracao.md`)

- **Limpar o HTML:** remover cabeçalho/menu/rodapé/template (o boilerplate "Prefeita | Vice | … | WEBMAIL", colunas, banners do tema), manter **só o corpo do conteúdo**. **Sanitizar** (allowlist), **decodificar e-mails ofuscados**, **baixar imagens inline** e **reescrever `src`/links internos** para as novas URLs. **Links externos (Agili/GWS/leis) ficam como estão.**
- **Notícias/Imprensa** → módulo de Notícias.
- **Fotos/Vídeos** → galerias (+ biblioteca de mídia).
- **Documentos hospedados no Joomla** → **cadastro de documentos** nas taxonomias certas (rotas-semente):
  - `/sic-legislacao/sic-portaria` → **Portarias**
  - `/sic-atos-normativos` → **Atos Normativos**
  - `/sic` → **Publicações/SIC**
  - `/contrato-e-aditivo/contrato` e `/contrato-e-aditivo/distrato` → **Contratos/Aditivos/Distratos**
  - **Baixar anexos** (PDF/DOC/XLS/ZIP) → biblioteca de mídia → vincular ao registro; **bloquear extensões perigosas**.
- **Secretarias** (endereço, e-mail, telefone, horário) → seção/Páginas; **Institucional** (Prefeita, Vice, Ex-Prefeitos, Estrutura, História, Economia, Demografia, Símbolos/Hino) → Páginas.
- **Joomla/K2:** listagem→item, **deduplicar** pelo id do item, percorrer **paginação**, pegar o **conteúdo completo** (não o "Leia mais").

## Fases (com checkpoint humano antes de importar)

1. **Descoberta** → lista de URLs (sitemap + MAPA DO SITE + crawl, só domínio Joomla).
2. **Inventário + classificação** → **CSV** (`migration/inventario.csv`) com `url, tipo_detectado, destino_modulo, categoria_destino, titulo, data`. **PARAR e pedir revisão/ajuste do de-para.**
3. **Extração + limpeza** (após aprovação).
4. **Re-hospedagem de mídia** (biblioteca de mídia via API, dedup por checksum).
5. **Importação de conteúdo** (via API, idempotente, RLS/tenant, links internos reescritos; links externos preservados).
6. **Redirects 301** (URL antiga **interna** → novo slug).
7. **Reconciliação** → `migration/relatorio.md`: migrados, falhas, **revisão manual**, **links quebrados**, **externos ignorados** (Agili/GWS/leis), conteúdo **não mapeado**.

## Implementação sugerida

- Workspace isolado `migration/` (Node/TS com `undici/fetch` + cheerio, **ou** Python com `httpx` + `selectolax`/BeautifulSoup) que **consome a API** — **não acoplar ao runtime do app**.
- Filas (BullMQ) para download de mídia e importação, **idempotentes**, respeitando os prefixos Redis reservados.
- Tudo **re-executável** e **incremental**.

## Critérios de aceite

- **Crawler nunca acessa** `agilicloud`/`agiliblue`/`gws-sistemas`/`leismunicipais` nem outro host externo; isso é verificável no log.
- **Inventário CSV** revisável gerado **antes** de importar; importação só após aprovação.
- Conteúdo público do Joomla migrado **no módulo certo** com **slug**, datas, categorias, autor e mídias **re-hospedadas** (nada apontando para o domínio antigo).
- **Imagens com alt**, HTML sanitizado, **e-mails decodificados**, **links internos reescritos**, **links externos preservados**.
- **301** das URLs antigas internas para os novos slugs.
- **Idempotente** (re-rodar não duplica); **RLS/tenant**, **só-API**, **auditoria** respeitados.
- **Relatório de reconciliação** com pendências e lista de externos ignorados.

## Documentação (obrigatória)

`docs/migracao-barao/`: visão geral do pipeline, **mapa de-para** final, **dicionário de classificação** (regras por padrão de URL/breadcrumb), **lista de domínios ignorados**, **tabela de redirects**, **relatório de reconciliação**, e **runbook** ("como rodar de novo / incremental"). Atualizar o README.

## Fora de escopo / honestidade

- **Não** copiar tema/template/código do site antigo (IP do fornecedor) — só conteúdo.
- **Não** rastrear nem migrar os **sistemas externos** (Agili/GWS/leismunicipais) — **só link**.
- **Não** raspar conteúdo dinâmico (Ouvidoria, formulários) — são módulos seus.
- Só se obtém o que é **público**; rascunhos/itens não publicados/contas **não vêm**. Parte exige **curadoria manual** (HTML bagunçado, links quebrados) — registrar no relatório.
- Respeitar `robots.txt`, rate limit e a **autorização** da contratante.
