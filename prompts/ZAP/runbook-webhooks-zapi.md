# Runbook — Webhooks Z-API + provisionamento por tenant

Parte do pacote `zapi-adapter`. Como ligar a Z-API ao backend (painel **e** via API) e como provisionar cada prefeitura. **Endpoints confirmados na doc oficial** (`developer.z-api.io`); onde houver dúvida de campo, confirme na **Documentação/Postman Collection** linkadas no próprio painel.

## Pré-requisitos
- Endpoint público **HTTPS** acessível (hostname do Cloudflare) — a **Z-API só aceita webhook HTTPS**. Responder **200 rápido** e processar assíncrono (BullMQ).
- Por tenant (segredo, não versionar): `instanceId`, `token`, `clientToken` (em **Segurança** no painel) e um `webhookSecret` aleatório.

## 1. Configuração manual (painel → "Webhooks e configurações gerais")

| Campo | Valor a colar | Usar? |
|---|---|---|
| **Ao receber** | `https://<API_PUBLICA>/webhooks/zapi/{tenant}/{secret}/on-receive` | **Sim (essencial)** — mensagens do cidadão (chatbot/ouvidoria) |
| **Receber status da mensagem** | `.../message-status` | **Sim** — entregue/lido (status, retry, auditoria) |
| **Ao conectar** | `.../connected` | **Sim** — saúde da instância |
| **Ao desconectar** | `.../disconnected` | **Sim** — detecta queda do número → alerta/fallback |
| **Ao enviar** | `.../on-send` | Opcional — confirmação de envio (auditoria) |
| **Presença do chat** | *(vazio)* | Não — "digitando/online", barulhento |
| **Notificar as enviadas por mim também** | *(toggle)* | Ligar **se** atendentes responderem pelo celular (mantém histórico no console) |

Configurações do WhatsApp: **Rejeitar chamadas automático = ON**; **Ler mensagens automático = OFF** (marcar como lida pelo app ao processar, preserva sinal de não-lida p/ atendente); **Ler status automaticamente = OFF**.
Configurações gerais: **Desabilitar enfileiramento quando desconectado = OFF** (mantém a fila da Z-API como rede de segurança numa queda rápida; quedas longas → webhook de desconexão + seu fallback).

## 2. Configuração via API (onboarding automatizado)

**Endpoints de atualização (método `PUT`, header `Client-Token`, `Content-Type: application/json`, body `{ "value": "<url>" }`):**

| Evento | Endpoint Z-API |
|---|---|
| Ao receber | `update-webhook-received` |
| Receber status da mensagem | `update-webhook-message-status` |
| Ao enviar | `update-webhook-delivery` |
| Ao conectar | `update-webhook-connected` |
| Ao desconectar | `update-webhook-disconnected` |
| (todos de uma vez) | `update-every-webhooks` |

> Para a opção "enviadas por mim", a doc usa `update-webhook-received-delivery` (recebimento com mensagens próprias) — exige o webhook "Ao receber" configurado. Confirme o nome do campo do body (`value`) na doc/Postman.

**Provisionar um tenant (esboço TS) — sub-paths por evento:**
```ts
const EVENTS: Record<string, string> = {
  'on-receive':     'update-webhook-received',
  'message-status': 'update-webhook-message-status',
  'on-send':        'update-webhook-delivery',
  'connected':      'update-webhook-connected',
  'disconnected':   'update-webhook-disconnected',
};

async function provisionarWebhooks(t: TenantZapi) {
  const base = `${process.env.ZAPI_BASE_URL}/${t.instanceId}/token/${t.token}`;
  for (const [sub, endpoint] of Object.entries(EVENTS)) {
    const url = `${process.env.PUBLIC_API}/webhooks/zapi/${t.slug}/${t.webhookSecret}/${sub}`;
    const r = await fetch(`${base}/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Client-Token': t.clientToken },
      body: JSON.stringify({ value: url }), // confirmar campo "value" na doc
    });
    if (!r.ok) throw new Error(`Falha ao setar ${endpoint} (${r.status})`);
  }
  // opcional: habilitar "enviadas por mim" via update-webhook-received-delivery
}
```

**Alternativa "tudo de uma vez":** chamar `update-every-webhooks` com **uma única URL** (`.../webhooks/zapi/{tenant}/{secret}`) e **discriminar pelo `type`** do payload no backend. Mais simples, mas sem sub-paths.

## 3. Roteamento no backend (por `type` do payload de entrada)
O POST de entrada traz um campo **`type`**; rotear:
- `ReceivedCallback` → mensagem recebida (chatbot/ouvidoria)
- `DeliveryCallback` → enviado/entregue ao WhatsApp (auditoria)
- `MessageStatusCallback` → status (recebido/lido/respondido/apagado)
- `ConnectedCallback` / `DisconnectedCallback` → saúde da instância (alerta + fallback)

(Confirme as strings exatas de `type` na doc.) Validar instância no payload, **idempotência por `messageId`**, e proteção por **path-secret + allowlist de IP** (a Z-API não assina o webhook).

## 4. Checklist de onboarding de uma prefeitura
1. Criar instância na Z-API → anotar `instanceId` e `token`.
2. **Segurança** → obter/ativar **Client-Token**.
3. Gerar `webhookSecret` aleatório; guardar tudo como **segredo do tenant**.
4. Rodar `provisionarWebhooks(tenant)` (ou `update-every-webhooks`).
5. Ajustar toggles (Rejeitar chamadas ON; Ler mensagens/Ler status OFF).
6. Conectar o número (QR Code).
7. **Testar:** enviar e receber; derrubar o número e confirmar o webhook `disconnected` + o **fallback** assumindo; reconectar e ver `connected`.
8. **Rotacionar** qualquer credencial que tenha sido exposta.
