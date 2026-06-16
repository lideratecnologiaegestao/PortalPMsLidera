# Spec — Atendimento Omnichannel (chatbot + atendimento humano) — bloco 13 TR

> Widget 24h no portal + bot IA que escala para agente humano + console admin
> (caixa de entrada unificada). Canais: widget e WhatsApp. Multi-tenant + RLS.
> Base: ADR-0002. Migration `db/050_atendimento_omnichannel.sql` (aplicada).
> Versão 1.0 — 2026-06-11.

## Arquitetura
- **Tempo real:** Socket.IO + `@socket.io/redis-adapter` (reusa a infra do ChatGateway), **namespace dedicado `/atendimento`** (path `/api/socket.io`). NÃO reaproveita o ChatGateway (que bloqueia cidadão) — novo `AtendimentoGateway`.
- **Bot:** `IaService` (RAG sobre CMS + Anthropic). Novo método `chatMultiturno(historico, mensagem, tenantId)`. Processamento do bot na fila BullMQ `atendimento` (job `atend.processar_mensagem`) — timeout ~20s + fallback escala.
- **Auth do visitante:** anônimo. Ao iniciar conversa (REST) recebe **token JWT de visitante** (TTL 30min, claim `conversaId`+`tenantId`, `typ:'atend+visitor'`), assinado com o segredo do projeto. O socket entra SÓ na sala `atend:<conversaId>`. Agente autentica por sessão (cookie) e entra nas salas do seu tenant/conversas atribuídas.
- **Escopo:** RLS por tenant. SERVIDOR vê só conversas da sua `secretariaId` (no serviço); OUVIDOR/ADMIN veem todas do tenant.

## Modelo de dados (migration 050 — já aplicada)
`tenants` += atendimento_humano_ativo, ia_chat_widget_ativo, atendimento_aviso_lgpd, atendimento_mensagem_fora_exp, atendimento_saudacao, atendimento_inatividade_min(30), atendimento_timezone('America/Cuiaba'), evolution_instancia.
`atendimento_horario` (tenant, dia_semana 0-6, hora_inicio, hora_fim, ativo; unique tenant+dia).
`atendimento_tags` (tenant, nome, cor; unique tenant+nome).
`atendimento_conversas` (canal 'widget'|'whatsapp', status 'bot'|'aguardando_agente'|'em_atendimento'|'encerrada', visitante_nome/email/telefone/identificador, cidadao_id?, secretaria_id?, agente_id?, assunto?, origem_url?, tag_ids uuid[], iniciada_em, encerrada_em?, ultima_atividade_em, bot_tentativas).
`atendimento_mensagens` (conversa_id, autor_tipo 'visitante'|'bot'|'agente'|'sistema', autor_id?, conteudo, anexos jsonb, interno bool, criado_em).
`atendimento_eventos` (conversa_id, tipo, ator_id?, payload, criado_em).
Prisma: Tenant(+campos), AtendimentoHorario/Tag/Conversa/Mensagem/Evento. text+CHECK (sem enum PG).

## Filas (queue.constants.ts)
`QUEUE_ATENDIMENTO='atendimento'`, `JOB_ATEND_PROCESSAR_MENSAGEM='atend.processar_mensagem'`, `JOB_ATEND_INATIVIDADE='atend.inatividade_check'`.

## Endpoints
### Público — widget (`/api/atendimento`)
- `GET /config` (sem auth) → `{ ativo, avisoLgpd, saudacao, expediente:[{diaSemana,horaInicio,horaFim,ativo}], dentroExpediente:bool }`.
- `POST /conversas` (sem auth) `{nome?,email?,assunto?,secretariaId?,origemUrl?}` → `{id, token, status}` (cria conversa status 'bot', emite saudação do bot).
- `GET /conversas/:id/token` (Bearer visitante) → `{token}` (refresh).
- `POST /conversas/:id/mensagens` (Bearer visitante) `{conteudo, anexos?}` → grava msg visitante, enfileira `atend.processar_mensagem`. Rate-limit ~10/min/conversa.
- `GET /conversas/:id/mensagens?before=` (Bearer visitante) → mensagens (SEM `interno=true`).

### Webhook WhatsApp (`/api/webhook`)
- `POST /evolution/:instancia` (HMAC header `X-Evolution-Signature`, timingSafeEqual) → resolve tenant por `evolution_instancia`, acha/cria conversa por número, grava msg visitante, enfileira processamento. Resposta rápida (assíncrono).

### Admin — console (`/api/admin/atendimento`, @Roles OUVIDOR, SERVIDOR, ADMIN_PREFEITURA)
- `GET /conversas?status=&canal=&secretariaId=&tagId=&q=&page=` (SERVIDOR escopado à secretaria).
- `GET /conversas/:id` → detalhe + mensagens (incl. internas) + eventos.
- `POST /conversas/:id/mensagens` `{conteudo, interno?, anexos?}` → responder ou nota interna; emite no socket; se canal whatsapp → WhatsappService.enviar.
- `POST /conversas/:id/assumir` → agente logado assume; status em_atendimento.
- `POST /conversas/:id/atribuir` (OUVIDOR/ADMIN) `{agenteId, secretariaId?}`.
- `POST /conversas/:id/transferir` `{secretariaId}` → status aguardando_agente; evento transferida.
- `POST /conversas/:id/encerrar` `{mensagemEncerramento?}` → status encerrada.
- `PATCH /conversas/:id/tags` `{tagIds:uuid[]}`.
- `GET /conversas/:id/transcricao` → `.txt` (sem notas internas).
- `GET /tags` · `POST /tags` (ADMIN) `{nome,cor}` · `DELETE /tags/:id` (ADMIN).
- `GET /config` (ADMIN) · `PUT /config` (ADMIN) flags/mensagens/timezone/inatividade · `PUT /config/horario` `{horario:[7]}`.

## Eventos de socket (namespace `/atendimento`)
Cliente→servidor: `entrar {conversaId}` (visitante, valida token), `entrar_agente {conversaIds[]}` (agente), `entrar_tenant` (agente → sala tenant), `typing {conversaId}`.
Servidor→cliente: `atend:mensagem {id,autorTipo,conteudo,criadoEm,interno}` (interno só p/ agentes), `atend:typing {autorTipo}`, `atend:status {status,agenteId?,agenteNome?}`, `atend:nova_conversa {conversaId,canal,assunto?,secretariaId?}` (sala tenant), `atend:encerrada {mensagem?}`.

## Fluxo do bot (job atend.processar_mensagem)
Para mensagem do visitante quando status='bot':
1. Se `ia_chat_widget_ativo=false` OU `ia_chat_habilitada=false` → escala direto (verifica expediente).
2. Detectar intent: (a) **consultar protocolo** (regex de protocolo/menção) → pede protocolo+chave → `tramitacao.acompanhar` → responde status; (b) **falar com atendente** (palavras-chave) → escalar; (c) FAQ → `ia.chatMultiturno(historico, msg)` → responde + fontes. Incrementa bot_tentativas; 2 falhas/baixa confiança → oferece escalar.
3. **Escalar:** verifica expediente (timezone do tenant). Dentro → status aguardando_agente, evento escalada, emite `atend:nova_conversa` na sala tenant + notifica agentes do depto. Fora → bot responde `atendimento_mensagem_fora_exp` + oferta de abrir manifestação (Ouvidoria/e-SIC).
Quando status='em_atendimento': não chama bot; roteia ao agente (socket).
Redigir PII (CPF/CNPJ/telefone) antes de enviar à IA. Logs sem PII (só ids/canal/status).

## Máquina de estados
bot→aguardando_agente (escala) ; aguardando_agente→em_atendimento (assumir/atribuir) ; em_atendimento→aguardando_agente (transferir) ; {aguardando_agente,em_atendimento,bot}→encerrada (agente/inatividade). Transição ilegal → 422.

## Inatividade
Worker `atend.inatividade_check` (cron/repeat) encerra conversas não-encerradas sem atividade > `atendimento_inatividade_min`.

## Frontend
- **Widget público** `web/components/portal/AtendimentoWidget.tsx` montado no layout público (quando `atendimento_humano_ativo`): botão flutuante → painel de chat (WCAG: role=dialog, ESC fecha, foco no composer, tema do tenant). Inicia conversa, conecta socket `/atendimento` com token, troca mensagens, mostra status (bot/aguardando/atendimento), expediente.
- **Console admin** `web/app/admin/atendimento/page.tsx`: caixa unificada (lista por status/canal/depto/tag + busca), abrir conversa, responder (WS), assumir/atribuir/transferir/encerrar, notas internas, tags, transcrição .txt, indicador de expediente.
- **Config** `web/app/admin/atendimento/config/page.tsx`: flags, mensagens (saudação/fora-expediente/aviso LGPD), timezone, inatividade, expediente (7 dias), tags (CRUD), instância Evolution.

## Fases
- **F1 (MVP, move N→A):** widget + bot (FAQ/protocolo/escala) + expediente + inbox admin (listar/abrir/responder/assumir/encerrar) + worker processar_mensagem + inatividade.
- **F2:** transferência, tags, notas internas, transcrição, tela de config completa.
- **F3:** webhook WhatsApp (Evolution) na mesma caixa.

## LGPD
Conversa pode ter PII → RLS, minimização, redigir PII antes da IA, sem PII em log. Retenção 2 anos pós-encerramento → anonimizar (job expurgo). ROPA #11.
