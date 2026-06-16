# ADR-0002 — Chatbot omnichannel + atendimento humano

- **Status:** Aceito (implementado — bloco 13 do TR)
- **Data:** 2026-06-11
- **Spec de implementação:** `specs/atendimento-omnichannel.md`

## Contexto

O TR exige um atendimento omnichannel: widget 24h no portal, bot que responde e
**escala para um agente humano**, console admin (caixa de entrada unificada) com
departamentos, tags, transferência, notas internas, transcrição e horário de
expediente, além de canal WhatsApp. O projeto já tinha peças isoladas: bot de IA
(`api/src/modules/ia`, RAG + Anthropic, stateless), chat interno de servidores
(Socket.IO + Redis adapter em `chat.gateway.ts`, que **bloqueia** o papel cidadão),
envio de WhatsApp via Evolution API (só saída), e consulta de protocolo
(`tramitacao.acompanhar`). Faltava o ciclo de vida da conversa cidadão↔bot↔agente,
multicanal, e o console.

## Decisão

1. **Novo módulo `atendimento`** com tabelas dedicadas (`atendimento_conversas`,
   `atendimento_mensagens`, `atendimento_tags`, `atendimento_horario`,
   `atendimento_eventos` — migration 050, RLS por tenant). NÃO sobrecarregar o chat
   interno, cujo ciclo de vida é diferente.
2. **Reusar a infra de tempo real** (Socket.IO + `@socket.io/redis-adapter`) num
   **namespace dedicado `/atendimento`** (gateway próprio), em vez de estender o
   `ChatGateway` (que rejeita cidadão e mistura responsabilidades).
3. **Visitante anônimo autentica por token de visitante** (JWT curto, TTL 30 min,
   claim `conversaId`+`tenantId`, `typ:'atend+visitor'`), que só dá acesso à própria
   conversa. Agente autentica por sessão (cookie) e escopo por papel/secretaria.
4. **Bot orquestrado em worker BullMQ** (fila `atendimento`): detecta intenção
   (consultar protocolo / falar com atendente / FAQ via `ia.chatMultiturno`),
   redige PII antes de enviar à IA, e escala respeitando o expediente do tenant.
5. **WhatsApp como canal da mesma caixa** via webhook da Evolution
   (`POST /api/webhook/evolution/:instancia`, HMAC), resolvendo o tenant pela
   instância; respostas saem pelo `WhatsappService`.

## Alternativas consideradas

- **Estender o chat interno** (reusar `chat_*`): rejeitado — o ciclo bot→humano, os
  canais e o visitante anônimo divergem demais; sobrecarregaria o modelo e o gateway.
- **Plataforma SaaS de chat de terceiros** (Chatwoot, Zendesk): rejeitado para o
  núcleo — quebraria a regra "frontend/app só falam com a API", multi-tenancy/RLS e a
  soberania do dado (LGPD). Pode ser integração futura opcional.
- **Bot síncrono no request HTTP**: rejeitado — latência da IA e timeouts; o
  processamento assíncrono em fila com fallback de escala é mais robusto.

## Consequências

- **Positivas:** reuso máximo da infra (Redis adapter, IA, protocolos); isolamento de
  tenant e de visitante garantidos; degrada com elegância (sem IA → escala ao agente;
  Redis fora → fail-open no chat interno permanece). Omnichannel real (widget +
  WhatsApp) na mesma caixa.
- **Custos/limitações:** o bot de FAQ depende de `ANTHROPIC_API_KEY` configurada; o
  `WhatsappService` usa instância Evolution global no env (multi-instância por tenant
  fica como evolução futura); mídias/emojis e expurgo/anonimização de conversas
  antigas ficam para fase 2.
- **Segurança/LGPD:** conversas podem conter dado pessoal → RLS, minimização, PII
  redigida antes da IA, sem PII em log, auditoria em `atendimento_eventos`, retenção
  2 anos com anonimização (ROPA #11).
