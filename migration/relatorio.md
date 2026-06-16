# Relatório de Reconciliação — Migração Barão de Melgaço

> Origem: `https://www.baraodemelgaco.mt.gov.br/` (Joomla + K2 / jDownloads)
> Destino: tenant `barao-de-melgaco-mt` · `https://barao.lidera.srv.br`
> Pipeline idempotente/resumível (ledgers em `migration/state/`). Gerado em 2026-06-13.

## Migrado (no ar)

| Módulo | Quantidade | Observações |
|---|---|---|
| Páginas institucionais (CMS) | **7** | história, economia, demografia, símbolos/hino, ex-prefeitos, prefeita, vice — imagens/brasão re-hospedados |
| Secretarias | **13** | 4 semeadas viraram dado real + 9 criadas; responsáveis reais em 11/13 |
| Notícias | **455** | de 456 (1 com slug duplicado); capa via `og:image` re-hospedada; categoria/data/autor |
| Carta de Serviços | **8** externos + modelo | IPTU, certidões, NFS-e, dívida, contribuinte, transparência, licitações, holerite, legislação (link externo) — 11 em destaque |
| Cadastro de Documentos | **1.180** | Leis Ordinárias 409, Portarias 272, Decretos 200, Balanço Anual 81, RREO 77, LOA 65, RGF 30, Diversos 15, Balancetes 10, LDO 11, LAI 6, Instruções 5, Leis Complementares 14, PPA 2, Aditivo/Distrato/Lei Orgânica 1 cada |
| Páginas Ouvidoria/LGPD (CMS) | **8** | inclui FAQ; políticas LGPD semeadas atualizadas com conteúdo real |
| Galeria — vídeos (YouTube) | **5** | |
| Galeria — fotos (capas de álbuns) | **~255** | 1 capa por álbum/evento |
| **Arquivos re-hospedados (MinIO)** | **~3.500+** | PDFs + imagens, servidos via `/midia/...` (zero links para o domínio antigo) |
| Redirects 301 mapeados | **1.681** | em `migration/state/redirects.json` — aguardam a feature de redirects (P0) para ativação |

## Erros / pendências de curadoria manual

- **12 documentos** falharam no upload (HTTP 400/500) — são "anexos" agregados grandes (LOA/LDO/Balanço **acima do limite de 25MB** da Biblioteca de Mídia). Reimportar com limite maior ou subir manualmente. Lista no `migration/state/documentos.log` (`grep ERRO`).
- **1 notícia** não migrada (slug duplicado) — revisar/renomear.
- **~55 vídeos** são `.mp4` **auto-hospedados** no servidor antigo (não YouTube), grandes demais para re-hospedar. Decisão: re-publicar como arquivo ou migrar para YouTube. (5 vídeos YouTube migrados.)
- **Fotos por álbum:** as galerias K2 carregam as fotos internas via JavaScript; foi migrada **1 capa por álbum**. Para o acervo completo de cada álbum, é necessário um crawl da pasta `/media/k2/galleries/{id}` (enhancement futuro).

## Categorias vazias (corretamente NÃO migradas)

- **Contratos / Extratos** e **Projetos de Lei** e **Chamamento Público** e **Normas Internas** retornaram 0 documentos hospedados — o conteúdo vive no **Agili** (externo) ou na estrutura externa. Mantidos como link, conforme escopo.

## Externos preservados como LINK (nunca raspados)

`*.agilicloud.com.br` (transparência, IPTU, alvará, certidão, NFe, holerite, dívida, contribuinte, licitações), `gws-sistemas.com.br` (carta de serviço), `leismunicipais.com.br` (legislação), `consultatransparencia.com.br` / `agendadatacenter.com.br` (Previ/RPPS), e institucionais (TCE/TRE/AL-MT/etc.). Incorporados na **Carta de Serviços** e no Acesso Rápido.

## Idempotência / re-execução

Cada lote tem ledger próprio (`migration/state/*.json`). Re-rodar **não duplica** — pula o já feito e completa o que faltou. Para reprocessar um lote, apague o ledger correspondente. Cache do HTML/binários cru em `migration/cache/`.

## Próximos passos (fase final)

1. **Redirects 301** — implementar a feature administrável (P0 #1) e carregar `redirects.json` (1.681 rotas antigas → novos slugs), para o cutover de `www.baraodemelgaco.mt.gov.br`.
2. **P0 backend** restante: relatório público de pedidos e-SIC, SIC físico, FAQ estruturada.
3. Reimportar os 12 anexos grandes (limite de mídia) e tratar os vídeos `.mp4`.
