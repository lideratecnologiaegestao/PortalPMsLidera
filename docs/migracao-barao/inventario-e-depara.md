# Migração Barão de Melgaço — Inventário e De-Para (Fase 0 + 1)

> **Status:** Descoberta concluída. **Aguardando aprovação humana do de-para** antes da extração/importação (checkpoint obrigatório do `PROMPT-migracao-barao.md`).
> **Origem:** `https://www.baraodemelgaco.mt.gov.br/` — Joomla + K2 (módulo `mod_news_pro_gk5`).
> **Tenant de destino:** Barão de Melgaço/MT (`barao-de-melgaco-mt`, id `95d89b67-b98b-4740-b0df-8745e3c10ec8`).
> Inventário tabular: [`migration/inventario.csv`](../../migration/inventario.csv).

## robots.txt (verificado)

É o `robots.txt` **padrão do Joomla** — bloqueia só pastas de sistema (`/administrator/`, `/cache/`, `/includes/`, `/libraries/`, `/tmp/`, etc.). **Não** bloqueia os caminhos de conteúdo (`/imprensa/...`, `/sic-...`, `/secretario-...`, institucionais). **Logo, a raspagem do conteúdo é permitida.** Não há `Sitemap:` declarado e `/sitemap.xml` retorna vazio → descoberta de URLs via **MAPA DO SITE** (`/mapa-do-site`, completo) + crawl restrito ao domínio.

## Volume estimado (para dimensionar a importação)

| Bloco | Volume | Observação |
|---|---|---|
| Notícias (K2) | **~480 itens** (24 págs × 20) | Maior esforço; várias categorias (geral + por secretaria) |
| Documentos/SIC (PDF) | **centenas** | Árvore por ano (2017–2026) em dezenas de categorias |
| Secretarias | **11** | Cada uma com estrutura/endereço/contato/fotos/notícias |
| Páginas institucionais | **~13** | Prefeita, vice, ex-prefeitos, história, economia, demografia, símbolos/hino, LGPD, ouvidoria, SIC |
| Galerias (fotos/vídeos) | **dezenas de álbuns** | Fotos re-hospedadas; vídeos como embed YouTube |

## Escopo — domínios

**RASPAR só:** `www.baraodemelgaco.mt.gov.br` e `baraodemelgaco.mt.gov.br`.

**IGNORAR (nunca rastrear/raspar) — só preservar como link externo:**
`*.agilicloud.com.br`, `agiliblue.agilicloud.com.br`, `gws-sistemas.com.br`,
`leismunicipais.com.br`, `consultatransparencia.com.br`, `agendadatacenter.com.br`,
`sites.google.com` (Plano Diretor), e demais hosts institucionais (tce/tre/al-mt/etc.).

## De-Para (regras por padrão de URL → módulo de destino)

| Conteúdo na origem (Joomla) | Destino na plataforma | Ação |
|---|---|---|
| `/imprensa/todas-as-noticias`, `/noticias-{cat}/item/{id}-{slug}` | **Notícias** (categoria, data, autor, capa, corpo limpo) | Raspar |
| `/imprensa/banco-de-imagens`, `/fotos-da-secretaria-*` | **Galeria (foto)** + Biblioteca de Mídia | Raspar + re-hospedar |
| `/imprensa/videos` | **Galeria (vídeo/YouTube)** | Raspar (embed) |
| `/secretario-*`, `/estrutura-*`, `/endereco-*`, `/fale-conosco-*`, `/fotos-*`, `/noticia-*` | **Secretarias** (consolida 5–6 subpáginas em 1 registro) | Raspar |
| `/prefeita`, `/vice-prefeito`, `/equipe-de-governo` | **Estrutura Organizacional** (autoridades) | Raspar |
| `/ex-prefeitos`, `/historia`, `/economia`, `/demografia`, `/simbolos-e-hinos` | **Páginas CMS** institucionais | Raspar |
| `/sic-atos-normativos/*` (decretos, leis, portarias, instruções, projetos de lei…) | **Cadastro de Documentos** (taxonomia TCE-MT) | Raspar + baixar PDFs |
| `/9-contratos`, `/contrato-e-aditivo/*` | **Contratos** (contrato/aditivo/distrato) | Raspar |
| `/sic`, `/sic-documentos-diversos-2`, `/sic-chamamento-publico` | **Cadastro de Documentos** | Raspar |
| `/sic-conselho-municipal-2/*` | **Conselhos** | Raspar |
| `/sic-planejamento-orcamentario/*`, `/sic-balancetes-*`, `/sic-balanco-*`, `/sic-lei-de-responsabilidade-fiscal/*` | **Transparência (documentos)** PPA/LDO/LOA/RGF/RREO/Balancetes | Raspar |
| `/sobre-a-ouvidoria`, `/como-surgiu`, `/ouvidoria-*` | **Páginas CMS** + canal = módulo **Ouvidoria** | Raspar texto / reimplementar canal |
| `/solicitar-informacao`, `/ultimas-solicitacoes`, `/unidade-de-atendimento`, `/perguntas-frequentes` | módulo **e-SIC** + CMS | Reimplementar |
| `/sobre-a-lgpd`, `/politica-*-lgpd`, `/termo-de-uso-lgpd` | **Páginas CMS** + módulo **LGPD** | Raspar texto |
| `/contato` | **Página CMS** + formulário no **Form Builder** | Raspar + reimplementar |
| Links Agili/GWS/leismunicipais/Previ | **Acesso Rápido** / **Carta de Serviços** (`urlExterna`) | **Só link** |

## Próximas fases (após aprovação do de-para)

2. **Extração + limpeza** — remove tema/menus/rodapé, decodifica e-mails ofuscados, normaliza charset→UTF-8 e datas pt-BR→ISO, baixa imagens/anexos.
3. **Re-hospedagem de mídia** — Biblioteca de Mídia via API multipart, dedup por checksum.
4. **Importação** — via API (token admin), idempotente por `url+hash`, RLS/tenant, links internos reescritos, externos preservados.
5. **Redirects 301** — URL antiga interna → novo slug.
6. **Reconciliação** — `migration/relatorio.md` (migrados, falhas, revisão manual, links quebrados, externos ignorados).

## Pendências de decisão (checkpoint)

1. **Plano Diretor** (Google Sites): linkar ou re-hospedar o conteúdo/PDFs? 
2. **Legislação** (leismunicipais): manter link ou ingerir o acervo de leis no nosso Cadastro de Documentos?
3. **Carta de Serviços** (GWS): manter link ou recriar os serviços no nosso módulo (com link externo para os sistemas Agili nas etapas de execução)?
4. **Transparência fiscal** (Agili): manter link agora; avaliar ETL contábil (ver `gap-analysis.md`).
