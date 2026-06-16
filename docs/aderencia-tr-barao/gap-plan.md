# Plano de fechamento de lacunas — TR Barão de Melgaço

Ordenado para **vender mais rápido**: começa pelos itens de **alto impacto / baixo-médio esforço** (fecham vários requisitos com pouco código) e termina nos **grandes builds**. Cada item reusa módulos existentes e respeita as regras invioláveis (RLS, só-API, mídia restrita, LGPD, WCAG, auditoria, filas).

Legenda de esforço: **P** pequeno (≤1 dia) · **M** médio (2–4 dias) · **G** grande (1–2+ semanas).

## Fase 1 — Quick wins (alto impacto, baixo esforço)
| # | Item | Fecha | Esforço |
|---|---|---|---|
| 1 | ✅ **SEO técnico**: `app/sitemap.ts` + `robots.ts` + Open Graph + Google Analytics (config do tenant em `/admin/home`) | Bloco 2 | P |
| 2 | ✅ **Modo manutenção** (flag por tenant no layout; `/admin` segue acessível; em `/admin/home`) | 3 | P |
| 3 | ✅ **Banners com datas início/fim + HTML** (filtra exibição por janela de datas) | 6 | P |
| 4 | ✅ **Popups** (módulo novo: imagem/vídeo/YouTube/HTML, por página, datas, frequência) — `/admin/popups` + `PopupModal` | 6 | M |
| 5 | ✅ **Áudio na galeria** (`tipo='audio'` + player) + campos fonte/legenda/crédito em notícias | 4 | P |
| 6 | ✅ **Anti-brute-force**: rate-limit no login (ThrottlerModule) + **auditoria de tentativas** (`LOGIN_FALHOU`). Geo/IP por país = borda Cloudflare (doc) | 1, 3 | P |
| 7 | ✅ **Política de senha**: `senha_alterada_em` + flag `senhaExpirada` no login (`SENHA_EXPIRA_DIAS`) + backfill | 1 | P |

**Fase 1 concluída.** Próximo: Fase 2 (avaliação/satisfação/relatórios).

## Fase 2 — Avaliação, satisfação e relatórios (muito cobrado no TR)
| # | Item | Fecha | Esforço |
|---|---|---|---|
| 8 | ✅ **Avaliação por estrelas (1–5)** dos serviços + **lista dos mais avaliados** (anônimo, anti-duplo via hash). `servico_avaliacoes` + `AvaliacaoServico`/`Estrelas` | 11 | M |
| 9 | ✅ **Pesquisa de satisfação** (já existia: `PesquisaSatisfacao` + UI no `/acompanhar`); dados agora saem nos relatórios export | 7, 11, 12 | M |
| 10 | ✅ **Relatório/dados por período exportáveis (CSV)** — `GET /api/admin/manifestacoes/relatorio?formato=csv` + export da lista `.../export` | 7, 12 | M |
| 11 | ✅ **Relatório TCE-MT (PDF + DOC)** da Ouvidoria — `?formato=pdf|doc` (pdfkit + HTML→msword): resumo/tipo/status/canal/secretaria/satisfação | 7 | M |
| 12 | ✅ **Separação por departamento** — filtro `secretariaId` + **servidor de área vê só a sua** (`escopoSecretaria`); ouvidor/admin veem tudo | 12 | M |

**Fase 2 concluída.** Próximo: Fases 3–4 (full-text docs, grupos/permissões, form builder, chatbot omnichannel, page builder).

## Fase 3 — Documentos e usuários (compliance)
| # | Item | Fecha | Esforço |
|---|---|---|---|
| 13 | **Indexação full-text do conteúdo dos arquivos** (extração PDF/DOCX via worker + FTS Postgres) — reusa o `tsvector` do Diário | 5 | G |
| 14 | **Categorias hierárquicas + nível de acesso por grupo** nos documentos | 5 | M |
| 15 | **Grupos com permissões granulares** + **sessões ativas/usuários online** + **relatórios de usuários** | 1 | M |
| 16 | **LGPD self-service** (titular pede acesso/portabilidade/exclusão) + registro de incidentes | 10 | M |

## Fase 4 — Grandes módulos novos
| # | Item | Fecha | Esforço |
|---|---|---|---|
| 17 | **Construtor visual de formulários** (drag-drop, tipos de campo, validações, CAPTCHA, envios, export Excel/XML/CSV, notificações e-mail) | 8 (todo) | G |
| 18 | **Chatbot omnichannel + atendimento humano** (console com caixa de entrada centralizada, departamentos, tags, transferência, notas internas, transcrição, mídias, horário, ativação do bot; widget 24h; integração a protocolos; WebSocket+Redis; WhatsApp via Evolution) | 13 (todo) | G |
| 19 | **Construtor de páginas drag-drop** (evolui o CMS de blocos) + templates + backup de páginas | 9 | G |

## Itens não-software (documentos/ADR)
| # | Item | Entrega |
|---|---|---|
| 20 | **Webmail** | ADR make-or-buy (Mailcow/Mailu/Zimbra vs. gerenciado) + módulo de administração de contas/quota/backup no portal |
| 21 | **Assessoria PNTP (RADAR)** | Documento de oferta de serviço + artefatos de suporte (checklist de transparência + relatórios) |
| 22 | **Guia de borda** | Config Cloudflare: WAF, geo-bloqueio, restrição admin por IP, modo manutenção de borda |
| 23 | **Backup & continuidade** | Rotina documentada (Postgres + MinIO), retenção, restore testado, SLA por município |

## Sequência recomendada
**Fase 1 → 2 → 3 → 4**, com os **documentos/ADR (20–23)** em paralelo. As Fases 1 e 2 já elevam a aderência de software para a faixa de ~75–85% com esforço relativamente baixo; o **chatbot omnichannel (18)** e o **construtor de formulários (17)** são os dois maiores investimentos e devem ser planejados como entregas dedicadas.
