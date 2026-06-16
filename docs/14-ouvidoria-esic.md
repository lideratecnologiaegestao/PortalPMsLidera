# 14 — Ouvidoria + e-SIC (canal cidadão ↔ ouvidor)

> Módulo de manifestações: Ouvidoria (Lei 13.460/2017) e e-SIC / Acesso à
> Informação (LAI 12.527/2011). Estende o núcleo existente (FSM + SLA) com a
> camada do cidadão, chat de tramitação, fluxo interno ouvidor↔área, painel do
> ouvidor, estatísticas e a seção da home. Spec de comportamento:
> `prompts/ouvidoria-esic-prompt/`.

## Visão geral

```
Cidadão (web)                    Servidores                       Home
 /ouvidoria  ─┐                  /admin/ouvidor (caixa única) ─┐   SecaoOuvidoriaEsic
 /esic       ─┼─► API ◄──────────/admin/minhas-atribuicoes  ──┼─► GET /estatisticas
 /acompanhar ─┘   (RLS por tenant)  (chat interno + responder)│   (KPIs + gráficos)
 /painel     ────► /manifestacoes/minhas                       │
```

Frontend e app falam **só com a API**. RLS isola por tenant. RBAC controla quem
tramita. Mídia do cidadão (futuro: anexos) entra como **restrita**.

## Modelo de dados

| Tabela | Migration | Conteúdo |
|---|---|---|
| `manifestacoes` | 004 + **021** | pedido/manifestação. 021 adicionou `chave_hash` (chave de acompanhamento, só o hash) |
| `manifestacao_eventos` | 004 | histórico imutável de transições (FSM) |
| `manifestacao_anexos` | 004 | anexos (storage_key → mídia restrita) — model Prisma adicionado em 021 |
| `manifestacao_mensagens` | **021** | chat de tramitação. `interno=true` = ouvidor↔área (oculto ao cidadão) |
| `pesquisa_satisfacao` | **021** | avaliação 1–5 pós-resposta (Lei 13.460) |
| `protocolo_contadores` | 013 | sequência atômica do protocolo por tenant/ano |

Todas com **RLS por tenant** (`app_enable_tenant_rls`). Protocolo: `AAAA######`.

## Máquina de estados (FSM) e SLA

A FSM (`state-machine.ts`) e o SLA (`sla.ts` + `sla.worker.ts`) já existiam e
não foram alterados. Estados: `registrada → em_analise → em_tratamento →
(aguardando_cidadao | prorrogada) → (respondida | indeferida |
parcialmente_atendida) → concluida` (+ `arquivada`, recursos e-SIC 1ª/2ª).

Prazos: **Ouvidoria 30+30**, **e-SIC 20+10**, recurso e-SIC 5 dias. Alerta em
80% do prazo; pausa em `aguardando_cidadao`; retoma e recalcula; prorrogação
estende. **Quando o cidadão responde por chat em `aguardando_cidadao`, o SLA
retoma automaticamente** (`TramitacaoService.mensagemCidadao` → evento
`retomar`).

## Contrato de API

### Público (`/api/manifestacoes`)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/` | registrar. e-SIC exige login (cidadaoId do token). Retorna `{id, protocolo, canal, chave}` — a **chave aparece uma única vez** |
| GET | `/estatisticas` | indicadores agregados (sem PII) — alimenta a home |
| GET | `/acompanhar?protocolo=&chave=` | detalhe público: status, prazos, marcos e chat (mensagens não-internas). Autoriza por **dono logado** ou **chave** |
| POST | `/acompanhar/mensagem` | `{protocolo, chave?, conteudo}` — cidadão adiciona mensagem; retoma SLA se aplicável |
| POST | `/acompanhar/avaliar` | `{protocolo, chave?, nota, comentario?}` — pesquisa de satisfação |
| GET | `/minhas?canal=` | painel do cidadão logado (suas manifestações) |

### Interno (`/api/admin/manifestacoes`, RBAC: OUVIDOR/SERVIDOR/GESTOR/ADMIN)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/?canal=&status=&tipo=&q=&minhas=true` | lista; `minhas=true` filtra os atribuídos ao usuário |
| GET | `/:id` | detalhe (eventos) — identidade mascarada se anônima |
| GET | `/:id/tramitacao` | chat completo (inclui mensagens internas) + eventos |
| POST | `/:id/mensagem` | `{conteudo, interno}` — mensagem ao cidadão ou interna (ouvidor↔área) |
| POST | `/:id/responder` | `{conteudo}` — publica resposta oficial e encerra o SLA |
| POST | `/:id/encaminhar` | `{secretariaId?, responsavelId?, observacao?}` — atribui + tramitação interna + transição |
| PATCH | `/:id` | atribuição (responsável/secretaria) |
| POST | `/api/manifestacoes/:id/eventos/:evento` | transição avulsa da FSM |

## Frontend

**Cidadão:** `/ouvidoria` (formulário por tipo + anônima), `/esic` (gate de
login gov.br), `/acompanhar` (protocolo+chave → status + chat + avaliação),
`/painel` (minhas manifestações). Componentes: `OuvidoriaForm`, `EsicForm`,
`AcompanharClient`, `Tramitacao` (chat), `MinhasManifestacoes`.

**Servidores:** `/admin/ouvidor` (caixa única dos dois canais — Painel do
Ouvidor), `/admin/ouvidoria`, `/admin/esic`, `/admin/minhas-atribuicoes` (fila
do servidor). O detalhe ganhou `TramitacaoAdmin`: chat (incl. interno), enviar
ao cidadão, **responder e encerrar prazo**, **encaminhar à área** (seletores de
secretaria e responsável).

**Home:** `SecaoOuvidoriaEsic` — KPIs (total, % no prazo, tempo médio, em
andamento) + gráfico de volume mensal (SVG) + proporção por canal, com CTAs.

## ADRs

- **Chave de acompanhamento (anônimo).** O protocolo é sequencial e adivinhável;
  expor o conteúdo só pelo protocolo permitiria leitura por terceiros. Geramos
  uma **chave** (10 caracteres, alfabeto sem ambíguos) guardada **apenas como
  hash SHA-256**; o texto é mostrado uma única vez no registro. A consulta exige
  protocolo **+** chave (ou ser o dono logado). LGPD: minimização e sigilo.
- **e-SIC exige identificação.** Anonimato é bloqueado no e-SIC (LAI exige
  identificar o solicitante); `cidadaoId` vem do token, nunca do body.
- **Tempo real por polling (não websocket).** O chat recarrega o detalhe a cada
  ação (enviar/responder). Simples, robusto atrás do Nginx/Cloudflare e
  suficiente para a cadência de uma ouvidoria. Websocket fica para fase futura.
- **Fluxo interno por mensagem `interno`.** Em vez de uma tabela separada de
  “tramitação interna”, a mesma thread carrega `interno=true` para ouvidor↔área;
  o cidadão nunca vê mensagens internas. Mantém uma linha do tempo única.

## Conformidade

- **Lei 13.460/2017:** tipos de manifestação, prazos 30+30, pesquisa de
  satisfação, relatório (estatísticas).
- **LAI 12.527/2011:** e-SIC identificado, prazos 20+10, recursos 1ª/2ª
  instância (FSM), classificação de sigilo (campo existente).
- **LGPD:** anonimato real (identidade mascarada no admin), chave por hash,
  notificações sem teor (fase 2), auditoria das transições (`manifestacao_eventos`
  + `audit_log`).
- **PNTP:** critérios 12.3 (e-SIC) e 14.2 (Ouvidoria) passam a ter canal
  funcional; 12.7/14.3 seguem por documento (relatório/carta de serviços).

## Notificações multicanal (WhatsApp + e-mail) — entregue (migration 022)

Módulo `notificacoes` (`api/src/modules/notificacoes/`):
- **Contatos verificados** (`user_contatos`): cada usuário (cidadão logado ou
  interno) cadastra WhatsApp + e-mail com **código de verificação** (hash, 15 min)
  e **opt-in por canal**. Endpoints `GET/PUT/POST /api/me/contatos[/verificar|/reenviar]`.
  UI `ContatosNotificacao` em `/painel` e `/admin/perfil`.
- **Worker** da fila `notificacoes` (`NotificacoesWorker`) processa o job
  `notif.enviar` dentro do TenantContext (RLS). `NotificacoesService`:
  - **Roteamento por evento → destino:** nova_manifestacao→ouvidores;
    atribuicao→responsável; cidadao_respondeu→responsável (ou ouvidores);
    resposta_publicada→cidadão; sla_proximo/sla_vencido→responsável.
  - **Canais:** WhatsApp via **Evolution API** (`WhatsappService`, instância do
    servidor) **e e-mail** (`EmailService`/nodemailer). WhatsApp só se verificado
    e opt-in; e-mail usa o contato verificado ou cai no e-mail de login (interno).
  - **Fallback** para e-mail se o WhatsApp falhar; **retry/backoff** na fila;
    **`notificacao_log`** (canal, status enviado|falha|ignorado, provedor, erro)
    com destinatário **mascarado**.
  - **LGPD:** a mensagem traz só `protocolo + ação + link` (cidadão→`/acompanhar`,
    interno→`/admin/ouvidor`) — nunca o teor.
- **E-mail é POR TENANT (migration 023).** Cada prefeitura tem domínio e caixa
  próprios → a config SMTP/IMAP fica em `tenant_email_config` (RLS), editada no
  **painel da entidade** em `/admin/email` (`/api/admin/config/email`,
  admin_prefeitura). A senha do SMTP é **cifrada em repouso** (AES-256-GCM com
  chave derivada do `AUTH_JWT_SECRET` — `common/crypto/secret-box.util.ts`) e
  nunca é devolvida pela API. `EmailService` resolve a config do tenant atual no
  envio (cache de transporter por tenant) e lança `EmailNaoConfigurado` se não
  houver config ativa (o envio é registrado como `ignorado`). Botão **“Enviar
  teste”** valida o SMTP. O WhatsApp (Evolution) segue compartilhado via
  `portal.env` (`EVOLUTION_API_URL/API_KEY/INSTANCE`).

## Fase 3 — anexos, recursos e-SIC e push (entregue)

- **Anexos do cidadão e do órgão** (`AnexosService` + `manifestacao_anexos`): a
  mídia é **sempre restrita** — vai ao object storage por caminho não-público
  (`restrito/<tenant>/manifestacao/<id>/…`) e o acesso passa pelo backend. EXIF/GPS
  removidos das imagens. Endpoints: público `POST /manifestacoes/acompanhar/anexo`
  (multipart, autorizado por protocolo+chave/dono) e `GET …/acompanhar/anexo/:id`
  (stream autorizado); admin `POST /admin/manifestacoes/:id/anexo` (origem órgão) e
  `GET /admin/manifestacoes/anexo/:id`. UI: botão **📎 Anexar** no chat do cidadão
  (`Tramitacao`) e no painel do ouvidor (`TramitacaoAdmin`), com lista + download.
  Tipos: imagem, PDF, doc/docx (≤ 15 MB). **Validado** (upload + download
  autorizado; bloqueio sem chave).
- **Recursos e-SIC na UI do cidadão**: `POST /manifestacoes/acompanhar/recurso`
  determina a instância (1ª/2ª) pela FSM, registra a justificativa no chat,
  aplica a transição (estende o SLA) e notifica a ouvidoria. O detalhe expõe
  `recursoDisponivel`; a UI mostra **“Abrir recurso”** quando cabível. **Validado**
  (respondida → recurso 1ª instância → oferece 2ª).
- **Push (App do Cidadão)**: `push_tokens` (migration 024) + `PushService` (Expo
  Push API) + `POST/DELETE /api/me/push-token`. O pipeline de notificações já
  envia push a quem tem token e registra em `notificacao_log` (canal `push`).
  **Pendente do app móvel** para registrar tokens — o backend está pronto.

## Como testar

```bash
# migration
psql "$DATABASE_URL" -f db/021_ouvidoria_tramitacao.sql
# dados de exemplo (tenant demo)
psql "$DATABASE_URL" -f infra/seed-ouvidoria-demo-exemplolandia.sql
```
Cidadão: `/ouvidoria` → registrar → guardar protocolo+chave → `/acompanhar` →
conversar. Ouvidor: `/admin/ouvidor` → abrir caso → responder/encaminhar.
