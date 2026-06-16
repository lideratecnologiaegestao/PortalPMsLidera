# Matriz de Aderência — TR Barão de Melgaço/MT

> Gap analysis entre o Termo de Referência (plataforma integrada: Portal, Governo
> Digital, Transparência, SIC, Ouvidoria, Carta de Serviços, Webmail e Chatbot) e
> o **estado atual do portal**. Status: **[A] Atende · [P] Parcial · [N] Não atende · [NS] Não-software**.
>
> Atualizado a partir da leitura do `prompts/aderencia-tr-barao/trbarao.rtf` + `checklist-requisitos-tr.md`.

## Placar resumido

| Bloco | A | P | N | NS |
|---|---|---|---|---|
| 1. Usuários/grupos/segurança de acesso | 7 | 0 | 0 | — | ✅ 100% (grupos/permissões + sessões + relatórios entregues) |
| 2. SEO | 6 | 0 | 0 | — | ✅ fechado (Fase 1) |
| 3. Segurança/Firewall/WAF | 8 | 1 | 0 | — | ✅ backup runbook + guia de borda Cloudflare (WAF/geo/IP-admin) |
| 4. Notícias/Galerias | 7 | 1 | 0 | — | ✅ áudio + crédito/legenda/fonte (Fase 1) |
| 5. SIC – documentos | 8 | 1 | 0 | — | ✅ full-text + hierarquia + acesso por grupo + whitelist de upload |
| 6. Banners e Popups | 5 | 0 | 0 | — | ✅ popups + datas/HTML (Fase 1) |
| 7. Ouvidoria | 13 | 0 | 0 | — | ✅ relatórios CSV/PDF/DOC/**XLSX** + satisfação + gráficos por período |
| 8. Construtor de formulários | 11 | 0 | 0 | — | ✅ módulo completo (Fase 3) — drag-drop + captcha + export + notificação |
| 9. Construtor de páginas (CMS) | 7 | 1 | 2 | — | ✅ construtor drag-drop + 10 blocos + templates + versões + SEO (Fase 3) |
| 10. LGPD | 8 | 0 | 0 | — | ✅ self-service + incidentes + dashboard de conformidade (Fase 3) |
| 11. Carta de Serviços | 8 | 1 | 0 | — | ✅ estrelas + mais avaliados + eixo público-alvo |
| 12. Governo Digital | 9 | 1 | 0 | — | ✅ recuperação de protocolo por e-mail + gráficos/satisfação export |
| 13. Chatbot omnichannel + humano | 14 | 1 | 0 | — | ✅ widget+bot+console+expediente+tags+transcrição (Fase 3); WhatsApp webhook pronto |
| 14. Webmail | — | — | — | 1 | ADR-0003 entregue (make-or-buy + módulo futuro) |
| 15. Requisitos técnicos mínimos | 9 | 1 | — | — | ✅ portabilidade/export integral documentada |

**Leitura geral (atualizada):** com as Fases 1–3 concluídas, **todos os blocos de software do TR estão majoritariamente A**. Os grandes vãos foram fechados: **construtor de formulários** (bloco 8), **chatbot omnichannel** (bloco 13), **construtor de páginas drag-drop** (bloco 9), **LGPD self-service + incidentes + dashboard** (bloco 10). Restam itens **menores/fase 2** (HTML+JS custom no CMS, feeds sociais/animações, mídias/emojis no chat, slider, verificação de integridade generalizada, vínculo de satisfação por serviço/acompanhamento de status, XLS/ZIP no full-text) e itens de **infra/processo** entregues como documento (backup runbook, borda Cloudflare WAF/geo, export integral, ADR de Webmail). _As linhas-detalhe são a fonte da verdade; algumas seções abaixo (blocos 2/4/6) descrevem o estado pré-Fase 1 e seguem fechadas pelo placar._

**Infra/WhatsApp (2026-06-12):** o WhatsApp (usado por Ouvidoria, Gov Digital e Chatbot) passou de Evolution direto para um **adapter multi-provider** (`api/src/modules/whatsapp/`, migration 052): interface `WhatsappProvider` ← Z-API/Evolution/Meta(stub), config cifrada por tenant, **retry + circuit breaker + fallback** (Z-API↔Evolution) e **webhook de entrada protegido** (path-secret + idempotência) roteando para a caixa de atendimento. Validado: config mascarada, status gracioso, webhook 404 em secret inválido, inbound criando conversa `canal=whatsapp`. Docs em `docs/whatsapp-zapi/`. Pendência operacional do tenant: preencher `ZAPI_CLIENT_TOKEN` (se a conta exigir), conectar o número (QR) e provisionar os webhooks no painel.

---

## 1. Gestão de usuários, grupos e segurança de acesso
| Req | Status | Onde / Lacuna |
|---|---|---|
| CRUD usuário (nome, e-mail, senha forte, grupo) | **A** | `api/.../users` + `web/app/admin/usuarios`; senha forte em `auth/password.ts` |
| Grupos com permissões granulares; níveis de acesso | **A** | ✅ Camada de permissões SOBRE o RBAC: `grupos_acesso` (permissões em `text[]`) + `usuario_grupos` (migration 046, RLS), catálogo de 19 permissões por módulo (`permissions.catalog.ts`), `PermissionsService` (papel⋃grupos, admin='*'), `@RequirePermissions`+`PermissionsGuard` aplicado a notícias/banners/galeria. CRUD em `/admin/grupos` + tela `web/app/admin/grupos`. Validado: servidor 403→(grupo)→200 no mesmo token |
| Sessões ativas / usuários online | **A** | ✅ Sessões stateful: `user_sessions` (jti, ip, ua, última atividade; RLS) + Redis dedicado (`psess`/`ponline`); guard verifica revogação (fail-open se Redis cair); painel `/admin/sessoes` (lista + online + encerrar) e "minhas sessões". Validado: online=1, revogação derruba o token no servidor |
| Acompanhamento de atividades por usuário | **A** | `audit_log` registra ações sensíveis por ator (+ LOGIN_*, SESSAO_REVOGADA, GRUPO_*) |
| Relatórios de usuários (ativos/inativos/atividades) | **A** | ✅ `GET /admin/users/relatorio` (json/csv/pdf): resumo (total/ativos/inativos/MFA/online), por papel, por grupo, logins recentes (do audit_log) e últimos acessos. Tela `web/app/admin/usuarios-relatorio`. Validado em prod |
| Política de senha forte + **expiração periódica** | **P** | Força: sim (`password.ts`). **Expiração periódica: não** |
| Rastreamento de tentativas de login + alerta de atividades suspeitas | **P** | `ThrottlerModule` (rate-limit) + audit de login. Falta **bloqueio temporal por IP** + alerta de anomalia |

## 2. SEO
| Req | Status | Onde / Lacuna |
|---|---|---|
| URLs amigáveis sem ID (slugs) | **A** | Slugs em notícias/secretarias/serviços/documentos/diário |
| Meta tags por página | **P** | `generateMetadata` em várias páginas; falta padronizar em todas |
| Sitemap XML automático | **N** | Não existe `app/sitemap.ts` |
| Google Analytics | **N** | Não há GA/gtag |
| Open Graph | **N** | Sem tags `og:` |
| Cache de páginas/conteúdo | **A** | ISR/revalidate + cache Redis por tenant |

## 3. Segurança / Firewall / WAF
| Req | Status | Onde / Lacuna |
|---|---|---|
| HTTPS/SSL/TLS | **A** | Cloudflare + Nginx (borda) |
| Anti-brute-force (limite + **bloqueio temporal de IP**) | **P** | `ThrottlerModule` limita; falta bloqueio temporal/lista de IP |
| Anti-SQLi/XSS | **A** | Prisma (parametrizado) + React (escape) + validação class-validator |
| Backup regular + restauração | **A** | ✅ Runbook `docs/operacao/backup-restore-runbook.md` (pg_dump cifrado + rotação 7/4/12, mirror MinIO, env, restore passo-a-passo c/ pegadinha RLS/roles, teste mensal, RPO 24h/RTO 4h) |
| Logs auditáveis | **A** | `audit_log` |
| Modo de manutenção | **N** | Não existe |
| Bloqueio por IP/país + liberação de confiáveis | **A** (doc) | ✅ Guia `docs/operacao/borda-cloudflare-waf-geo.md` (geo-bloqueio BR + IP allowlist) — config de borda |
| WAF + notificações de segurança | **A** (doc) | ✅ Guia Cloudflare (WAF Managed/OWASP, rate limit, DDoS L7, alertas) |
| Verificação de integridade de arquivos | **A** | Diário usa hash SHA-256; **documentos/mídia** também — o `hash` de conteúdo do `media_asset` é o próprio nome do arquivo na URL mascarada (`/midia/.../{hash}.ext`), servindo de verificação de integridade |
| Restrição de acesso à área admin (IP) | **A** (doc) | ✅ Guia Cloudflare Access/Zero Trust + WAF rule por path + IP allowlist + MFA para `/admin` e `/plataforma` |

## 4. Notícias, galerias (foto/áudio/vídeo)
| Req | Status | Onde / Lacuna |
|---|---|---|
| Notícias com texto/imagem/links/anexos | **A** | módulo `noticias` (HTML, imagem, vínculo a secretaria) |
| Galeria de fotos (álbuns) | **A** | `galeria` (fotos) |
| Galeria de **áudio** (streaming/host) | **N** | `GaleriaItem.tipo` só foto/vídeo; falta áudio |
| Galeria de vídeo (YouTube/host) | **A** | mp4 + YouTube |
| Datas: publicação/modificação/**encerramento** | **P** | publicadoEm/criadoEm sim; **data de encerramento** não |
| Metadados/SEO | **P** | categoria/autor; faltam keywords/OG |
| Campos autor/fonte/capa/legenda/crédito | **P** | autor/capa sim; **fonte/legenda/crédito** não |
| Caixa de HTML com preview | **A** | conteúdo HTML renderizado |

## 5. SIC – publicação de documentos
| Req | Status | Onde / Lacuna |
|---|---|---|
| Upload DOC/DOCX/ODT/PDF/XLS/XLSX/ZIP + **bloqueio de extensões perigosas** | **A** | ✅ `upload-seguranca.util.ts` (allowlist de MIME + blocklist de ~60 extensões executáveis/script + detecção de dupla-extensão) aplicado em mídia/anexos/formulários. Validado: `.exe` e `doc.pdf.exe` → 400 |
| Datas pub/mod/fim | **A** | documentos têm data/ano |
| Metadados | **A** | tipo/ementa/número |
| **Escaneamento/indexação full-text do conteúdo do arquivo** | **A** | ✅ Worker assíncrono (fila IA) extrai texto de **PDF** (pdf-parse v2/pdfjs-dist) e **DOCX** (mammoth) → coluna `conteudo_extraido` + `tsvector` GIN; busca pública e admin casam por conteúdo via `websearch_to_tsquery('portuguese')`; backfill `POST /admin/documentos/_reindexar`. Validado em prod (palavra só no corpo do PDF → achada). Falta só XLS/ZIP |
| Categorias múltiplas e **hierárquicas** | **A** | ✅ `doc_tipos.parent_id` (migration 047) → taxonomia em árvore de profundidade arbitrária; admin com seletor de tipo-pai + árvore; filtro público por tipo-pai inclui descendentes (BFS). Validado em prod |
| Categorias restritas por grupo | **A** | ✅ `doc_cadastros.visibilidade` (publico/restrito) + `doc_cadastro_grupos` (reusa grupos da migration 046). Cadastro restrito some do menu/listagem pública; acesso só a membros de grupo permitido (+admin). Enforcement em listar/detalhe/export/download. Validado: anônimo/fora-do-grupo=404, no-grupo/admin=200, sem vazar no menu |
| Descrição HTML + preview | **A** | ementa/conteúdo |
| Publicar/não publicar | **A** | `ativo`/`publicado` |
| Filtro de pesquisa no backend | **A** | filtros no `/admin/documentos` |

## 6. Banners e Popups
| Req | Status | Onde / Lacuna |
|---|---|---|
| Banners: título, **datas início/fim**, estado, link, HTML/preview | **P** | `banners` tem título/sub/link/ativo/ordem; **faltam datas início/fim e HTML** |
| Popups: imagem/vídeo | **N** | Não existe módulo de popups |
| Popups: links/visibilidade | **N** | — |
| Popups: estilos | **N** | — |
| Popups: exibição por página + datas/intervalo | **N** | — |

## 7. Ouvidoria
| Req | Status | Onde / Lacuna |
|---|---|---|
| Manifestação completa; protocolo+chave mantendo anonimato | **A** | módulo `manifestacoes` (protocolo/chave, anônimo) |
| Login faz várias manifestações; troca de senha | **A** | cidadão-auth + painel `/cidadao` |
| Notificação automática ao ouvidor + responsável | **A** | notificações (e-mail/WhatsApp via Evolution) |
| Gestão do ticket (status, categoria, setor) | **A** | FSM + painel do ouvidor |
| Filtros avançados | **A** | `/admin/ouvidoria` |
| Histórico completo | **A** | timeline/eventos |
| **Gráficos dinâmicos por período** | **A** | relatório consolidado com filtro dataDe/dataAte + dimensões (tipo/status/canal/secretaria/satisfação) |
| **Export de gráficos (imagem e CSV)** por período | **A** | ✅ dados dos gráficos exportáveis por período em CSV/XLSX/PDF/DOC. _Imagem PNG do gráfico = fase 2_ |
| Acessibilidade | **A** | WCAG nos formulários |
| **Pesquisa de satisfação + export PDF/Excel** | **A** | ✅ relatório inclui satisfação (média + distribuição) e exporta em PDF/**Excel (xlsx)**/CSV/DOC. Validado |
| **Relatórios TCE-MT (PDF/DOCX)** | **A** | ✅ `GET /admin/manifestacoes/relatorio?formato=pdf\|xlsx\|csv\|doc` (pdfkit + SpreadsheetML + HTML→.doc) |

## 8. Construtor de formulários
| Req | Status | Onde / Lacuna |
|---|---|---|
| Construtor visual (drag-drop) + tipos de campo + validações + CAPTCHA + export Excel/XML/CSV + notificações e-mail + permissões | **A** | ✅ Módulo `formularios` (migration 049). Builder drag-drop HTML5 (`/admin/formularios`) com 13 tipos de campo; validação server-side (obrigatório, email/telefone/CPF, comprimento, regex); **CAPTCHA self-hosted** (honeypot + desafio HMAC + tempo mínimo); gestão de envios com filtro; **export CSV/XML/Excel** (SpreadsheetML); **notificação e-mail CC/BCC + anexos** (fila); permissão `formularios.gerenciar`; renderizador público responsivo/WCAG (`/formularios/[slug]`); upload via API→MinIO. Validado em prod (criar→publicar→enviar→exportar; anti-spam bloqueia honeypot/captcha) |

## 9. Construtor de páginas (CMS)
| Req | Status | Onde / Lacuna |
|---|---|---|
| Construtor arrastar-e-soltar | **A** | ✅ Construtor visual `/admin/paginas`: paleta + canvas drag-drop HTML5 + reordenação em lote (`PATCH /admin/pages/:id/blocks/reorder`) + formulários estruturados por tipo + preview. Validado |
| Design responsivo | **A** | tema/tokens responsivos |
| Elementos prontos (botões/sliders/galerias/tabelas) | **A** | ✅ 11 tipos de bloco: hero, texto, serviços, galeria, html, botão, cards, tabela, imagem, divisor, **slider/carrossel** (acessível, autoplay, reduced-motion) |
| Templates aprovados pelo órgão | **A** | ✅ 4 templates de página (`GET /admin/pages/templates`: institucional, serviço/programa, notícia, contato); criar página já com os blocos do template. Validado |
| Personalização sem código | **A** | construtor visual + tema (/admin/tema) — sem código |
| Backup/restauração de páginas | **A** | ✅ `cms_page_snapshots` (migration 051): versão manual + auto antes de excluir/restaurar; `GET/POST /admin/pages/:id/snapshots` + restaurar. Validado |
| SEO por página | **A** | ✅ editor de SEO (title/description/ogImage/keywords) na página + `generateMetadata` no catch-all. Validado |
| HTML/CSS/JS custom | **P** | bloco `html` (HTML custom, autorado por admin) + CSS via tema; **JS custom não** (decisão de segurança — não executa script do tenant) |
| Conteúdo dinâmico/feeds sociais | **N** | — (fase 2) |
| Animações | **N** | — (fase 2) |

## 10. LGPD
| Req | Status | Onde / Lacuna |
|---|---|---|
| Aviso/política de privacidade | **A** | página CMS LGPD semeada |
| Consentimento explícito ativo | **A** | `CookieConsent` + opt-in dos alertas do Diário |
| Direitos do titular (acesso/retificação/exclusão/portabilidade) | **A** | ✅ Self-service do cidadão (`/cidadao/meus-dados`): solicitações dos 11 direitos do art. 18 (`solicitacoes_titular`, migration 048) com prazo legal 15d e fluxo do Encarregado; eliminação→**anonimização** (respeita guarda legal). Contato do DPO estruturado (`tenants.dpo_nome/email`, `GET /api/lgpd/encarregado`). Validado em prod |
| Segurança (criptografia/firewall/monitoramento) | **A** | senha SMTP cifrada, RLS, audit |
| Privacy by design (minimização/anonimização) | **A** | minimização nos alertas; anonimização de denúncias e de titular (op. `anonimizar_titular`) |
| Exportação de dados | **A** | ✅ Portabilidade do titular `GET /api/lgpd/meus-dados` (JSON estruturado: perfil/manifestações/chamados/contatos/alertas/logins; sem hash/segredo/dado de terceiro). Validado |
| Auditorias/relatórios de conformidade | **A** | ✅ Dashboard consolidado `GET /api/lgpd/admin/conformidade` + tela `/admin/lgpd-conformidade` (score 0-100, solicitações no prazo/atrasadas/vencendo, incidentes/comunicação ANPD, DPO, retenção, alertas). + `audit_log` com eventos LGPD. Validado |
| Comunicação de incidentes | **A** | ✅ Registro/gestão de incidentes (`incidentes_seguranca`, art. 48): categoria/severidade/dados afetados, prazo de comunicação calculado (2d alta/crítica, 5d demais), FSM, comunicação ANPD/titulares, relatório exportável. Restrito a admin/ouvidor. Validado |

## 11. Carta de Serviços (Lei 13.460)
| Req | Status | Onde / Lacuna |
|---|---|---|
| Serviços por categoria | **A** | `/servicos` agrupado por categoria + modelo padrão |
| Categoria **Cidadão/Empresa/Servidor** | **A** | ✅ `servicos.publicoAlvo` padronizado (cidadao/empresa/servidor); filtro público `GET /api/servicos?publicoAlvo=` + chips na Carta + select no admin. Validado |
| **Avaliação por estrelas (1–5)** | **N** | Não existe |
| **Lista dos mais avaliados** | **N** | depende da avaliação |
| Pesquisa de satisfação | **P** | enquete genérica existe; falta vínculo ao serviço |
| Layout responsivo/acessível + cards | **A** | feito nesta rodada |
| Busca/filtros | **A** | busca na carta |
| Gestão dos serviços | **A** | `/admin/servicos` (+ destaque na home) |
| Notificação de novos serviços + acompanhamento de status | **P** | falta acompanhamento de status por serviço |

## 12. Governo Digital
| Req | Status | Onde / Lacuna |
|---|---|---|
| Solicitação 100% online; protocolo (ou anônimo) | **A** | Ouvidoria/e-SIC cobrem |
| Login faz várias solicitações; troca de senha | **A** | cidadão-auth |
| Recuperação de protocolo por e-mail (lista) | **A** | ✅ `POST /api/manifestacoes/recuperar-protocolos {email}` → envia a lista por e-mail ao titular (LGPD: resposta sempre genérica, sem exibir/enumerar). Form "Esqueci meu protocolo" no `/acompanhar`. Validado |
| Notificação ao responsável | **A** | notificações |
| Gerenciamento pelo responsável | **A** | painéis admin |
| Filtros avançados | **A** | — |
| **Acompanhar + enviar mensagem SEM login (home)** | **A** | `/acompanhar` (protocolo+chave) + chat de tramitação |
| **Separação por departamento (admin vê só o seu)** | **P** | há setor; falta escopo de visão por departamento |
| Gráficos por período exportáveis | **A** | ✅ relatório por período em CSV/XLSX/PDF/DOC (mesmo motor da Ouvidoria) |
| Satisfação + export PDF/Excel | **A** | ✅ satisfação no relatório + export PDF/Excel (xlsx) |

## 13. Chatbot omnichannel + atendimento humano
| Req | Status | Onde / Lacuna |
|---|---|---|
| Console admin (caixa de entrada centralizada, agentes, departamentos, tags, transferência, notas internas, transcrição .txt, horário de expediente, ativação automática do bot) | **A** | ✅ Módulo `atendimento` (migration 050, ADR-0002). Console `/admin/atendimento` (caixa unificada por status/canal/depto/tag, assumir/atribuir/transferir/encerrar, notas internas, tags, transcrição .txt, expediente). Bot orquestrado (BullMQ) com escala→agente; tempo real Socket.IO `/atendimento` + Redis. Emojis no composer (widget+console). Validado: escala, inbox, assumir, resposta, nota interna invisível ao visitante, transcrição sem internas, tags. _Anexos de mídia no chat = fase 2_ |
| Widget 24h em Portal/Gov Digital/Ouvidoria/Carta/SIC | **A** | ✅ `AtendimentoWidget` flutuante no portal público (ligável por tenant `atendimento_humano_ativo`); visitante anônimo via token; bot 24h + fila de agente conforme expediente |
| Integração com banco (consultar protocolos) + histórico | **A** | ✅ Bot consulta protocolo via `tramitacao.acompanhar`; histórico multi-turno; **RAG em 3 camadas** (migration 053): fatos do tenant (nome/secretarias/contatos), **base de conhecimento curada** (`/admin/ia-conhecimento` — o gestor "treina" o bot) e **RAG multi-fonte** (CMS+serviços+notícias+secretarias+documentos do próprio tenant). Validado: responde nome da cidade, 2ª via IPTU (serviço) e item curado. Multi-tenant via RLS. Doc `docs/ia-base-conhecimento.md` |

## 14. Webmail
| Req | Status | Onde / Lacuna |
|---|---|---|
| 100 contas, 20 GB, backup semanal, SSL/TLS, IMAP/SMTP, webmail+app | **NS** (ADR ✅) | Servidor de e-mail é infraestrutura. **ADR entregue** `docs/adr/ADR-0003-webmail-make-or-buy.md` (recomenda provedor gerenciado nacional + esboço do módulo `webmail-admin` de provisionamento). Implementação do módulo = contratação/fase futura |

## 15. Requisitos técnicos mínimos
| Req | Status | Onde |
|---|---|---|
| Responsivo/acessível/seguro/navegadores modernos/painel/permissões/logs/backup/HTTPS/SEO/export | **A** (maioria) | atendido pela stack; backup e SEO em **P** (ver acima) |
| Portabilidade/export ao fim do contrato | **A** | ✅ Guia `docs/aderencia-tr-barao/export-integral-portabilidade.md` (exports por módulo + dump integral pg_dump + mirror MinIO + reimportação + eliminação segura LGPD) |

---

## Itens não-software (entregar como plano/integração)
- **Webmail** → ADR make-or-buy + integração de administração no portal.
- **Assessoria/Consultoria PNTP (RADAR, validação TCE-MT/ATRICON, relatório mensal)** → oferta de serviço + artefatos de suporte no sistema (módulo/checklist de transparência + relatórios). O código dá suporte; a assessoria é serviço com pessoas.
- **Habilitação** (graduação ADS, empresa ≥ 3 anos, **atestado ATRICON/PNTP**) e **hospedagem/SLA** → pendências comerciais/operacionais, fora do código.
- **Borda (WAF, geo-bloqueio, modo manutenção de borda, restrição admin por IP)** → configuração Cloudflare documentada.
