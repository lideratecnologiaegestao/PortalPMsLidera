# Contrato da Interface e Mapa de Endpoints

> Descreve a interface `WhatsappProvider`, os tipos de dados trocados e o mapeamento de endpoints entre Z-API e Evolution. Baseado exclusivamente no codigo implementado.

---

## Interface `WhatsappProvider`

Definida em `api/src/modules/whatsapp/whatsapp-provider.interface.ts`.

```typescript
export type ProviderNome = 'zapi' | 'evolution' | 'meta';

export interface WhatsappProvider {
  readonly nome: ProviderNome;
  sendText(to: string, message: string): Promise<SendResult>;
  sendMedia(to: string, media: MediaInput, caption?: string): Promise<SendResult>;
  sendButtons?(to: string, payload: ButtonsInput): Promise<SendResult>;  // opcional
  getStatus(): Promise<{ conectado: boolean; detalhe?: string }>;
  parseInbound(raw: unknown): InboundMessage | null;
}
```

### Tipos de dados

```typescript
// Resultado de qualquer operacao de envio
export interface SendResult {
  id?: string;   // ID da mensagem retornado pelo provider (pode ser undefined)
  ok: boolean;
  erro?: string;
}

// Entrada para envio de midia
export interface MediaInput {
  url?: string;       // URL publica da midia (preferencial)
  base64?: string;    // Base64 (fallback quando nao ha URL publica)
  fileName?: string;
  tipo: 'image' | 'document';
}

// Entrada para envio de botoes interativos
export interface ButtonsInput {
  message: string;
  buttons: { id: string; label: string }[];
}

// Mensagem normalizada recebida pelo webhook (independente do provider)
export interface InboundMessage {
  messageId: string;  // ID unico no provider — usado para idempotencia
  from: string;       // Numero do remetente (so digitos, ex.: 5565999990000)
  texto?: string;
  tipo: string;       // Tipo do evento no provider (ex.: ReceivedCallback)
  nome?: string;      // Nome do remetente (best-effort)
  instancia?: string; // ID da instancia — para validacao multi-tenant
}
```

### Observacao sobre `sendButtons`

O metodo e marcado como opcional (`sendButtons?`). Providers que nao suportam botoes interativos podem omiti-lo. O `WhatsappService` verifica a existencia antes de chamar:

```typescript
p.sendButtons ? p.sendButtons(numero, payload) : p.sendText(numero, payload.message)
```

O `ZApiProvider` implementa `sendButtons` com fallback interno: se o endpoint `/send-button-list` retornar erro, reenvia como texto numerado (ex.: `1. Opcao A\n2. Opcao B`).

---

## Mapa de endpoints: Z-API x Evolution

| Acao | Z-API | Evolution |
|---|---|---|
| **Enviar texto** | `POST /send-text` body `{ phone, message }` | `POST /message/sendText/{instance}` body `{ number, text }` |
| **Enviar imagem** | `POST /send-image` body `{ phone, image (url\|base64), fileName?, caption? }` | `POST /message/sendMedia/{instance}` body `{ number, mediatype:'image', media (url\|base64), fileName, caption }` |
| **Enviar documento** | `POST /send-document/{ext}` body `{ phone, document (url\|base64), fileName?, caption? }` | `POST /message/sendMedia/{instance}` body `{ number, mediatype:'document', media (url\|base64), fileName, caption }` |
| **Botoes interativos** | `POST /send-button-list` body `{ phone, message, buttonList: { buttons: [{id, label}] } }` | `POST /message/sendButtons/{instance}` body `{ number, title, buttons: [{buttonId, buttonText:{displayText}}] }` |
| **Status de conexao** | `GET /status` | `GET /instance/connectionState/{instance}` |
| **ID da mensagem na resposta** | `zaapId` ou `messageId` ou `id` | `key.id` ou `id` |
| **Header de autenticacao** | `Client-Token: {clientToken}` (opcional, ver nota) | `apikey: {apiKey}` |

> **Nota Client-Token:** o `ZApiProvider` so envia o header `Client-Token` quando `clientToken` esta configurado. E opcional na Z-API — exigido apenas quando a conta tem "Seguranca da conta" habilitada no painel.

### Forma das chamadas Z-API

**URL base por instancia:**
```
{ZAPI_BASE_URL}/{ZAPI_INSTANCE_ID}/token/{ZAPI_TOKEN}/<acao>
```

Exemplo com `baseUrl` padrao:
```
https://api.z-api.io/instances/{instanceId}/token/{token}/send-text
```

**Formato do numero de telefone:** `55` + DDD + numero, somente digitos.
```
5565999990000   (Mato Grosso, DDD 65, celular 999990000)
```
O `ZApiProvider.normalizar()` adiciona o prefixo `55` automaticamente se ausente.

**Timeout por operacao:**
- Texto e botoes: 12 000 ms
- Midia (imagem/documento): 30 000 ms
- Status: 8 000 ms

---

## Rotas internas da API

### Webhook de entrada (registrado no AtendimentoModule)

| Metodo | Rota | Descricao |
|---|---|---|
| `POST` | `/api/webhooks/zapi/:tenant/:secret/:evento` | Evento explicito no path (`on-receive`, `message-status`, `on-send`, `connected`, `disconnected`) |
| `POST` | `/api/webhooks/zapi/:tenant/:secret` | Sem sub-path — evento discriminado pelo campo `type` do body |

- `:tenant` e o `slug` do tenant (ex.: `exemplo`).
- `:secret` e o `zapiWebhookSecret` gerado automaticamente ao salvar config com `provider=zapi`.
- Validacao por `timingSafeEqual` — resposta generica 404 para slug invalido ou secret errado (anti-enumeracao).
- Resposta 200 imediata; processamento assicrono via `setImmediate`.

### Roteamento de eventos no webhook

| `type` no payload / `:evento` no path | Acao |
|---|---|
| `ReceivedCallback` / `on-receive` | Processa mensagem recebida → cria/continua conversa → enfileira job |
| `MessageStatusCallback` / `message-status` | Auditoria de status (sem PII) |
| `DeliveryCallback` / `on-send` | Auditoria de status (sem PII) |
| `ConnectedCallback` / `connected` | Log + auditoria `WHATSAPP_CONECTADO` |
| `DisconnectedCallback` / `disconnected` | Log + auditoria `WHATSAPP_DESCONECTADO` |
| qualquer outro | Ignorado silenciosamente |

### Rotas admin (requerem RBAC `ADMIN_PREFEITURA`)

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/admin/whatsapp/config` | Config mascarada do tenant (sem tokens em claro) |
| `PUT` | `/api/admin/whatsapp/config` | Grava config cifrada; gera `zapiWebhookSecret` se ausente |
| `GET` | `/api/admin/whatsapp/status` | Verifica conexao do provider ativo |
| `POST` | `/api/admin/whatsapp/provisionar-webhooks` | Registra URLs de webhook na Z-API via `update-webhook-*` |
| `POST` | `/api/admin/whatsapp/enviar-teste` | Envia mensagem de teste; numero mascarado na auditoria |

#### Body de `PUT /api/admin/whatsapp/config`

```json
{
  "provider": "zapi",
  "fallbackProvider": "evolution",
  "zapiInstanceId": "INSTANCE_ID",
  "zapiToken": "TOKEN_EM_CLARO",
  "zapiClientToken": "CLIENT_TOKEN_EM_CLARO",
  "evolutionApiUrl": "http://evolution:8080",
  "evolutionInstance": "INSTANCE_NAME",
  "evolutionApiKey": "API_KEY_EM_CLARO",
  "ativo": true
}
```

Campos omitidos mantem o valor atual. Tokens sao cifrados antes de gravar.

#### Resposta de `GET /api/admin/whatsapp/config`

```json
{
  "provider": "zapi",
  "fallbackProvider": "evolution",
  "zapiInstanceId": "INSTANCE_ID",
  "zapiTokenDefinido": true,
  "zapiClientTokenDefinido": false,
  "zapiWebhookSecretDefinido": true,
  "evolutionApiUrl": "http://evolution:8080",
  "evolutionInstance": "INSTANCE_NAME",
  "evolutionApiKeyDefinida": true,
  "ativo": true
}
```

Flags booleanas (`*Definido`/`*Definida`) indicam se o segredo esta gravado, sem expor o valor.

#### Body de `POST /api/admin/whatsapp/provisionar-webhooks`

```json
{ "useEveryWebhook": false }
```

- `false` (padrao): provisiona sub-paths por evento via `update-webhook-*` (recomendado).
- `true`: usa `update-every-webhooks` com URL unica, tipo discriminado pelo campo `type` do payload.

Requer `zapiClientToken` configurado para assinar as chamadas PUT.

#### Body de `POST /api/admin/whatsapp/enviar-teste`

```json
{ "numero": "65999990000", "texto": "Mensagem opcional" }
```

---

## Endpoints Z-API de provisionamento de webhook

O `WhatsappAdminController.provisionarWebhooks` chama os seguintes endpoints da Z-API (metodo `PUT`, header `Client-Token`, body `{ "value": "<url>" }`):

| Sub-path no nosso webhook | Endpoint Z-API chamado |
|---|---|
| `/on-receive` | `update-webhook-received` |
| `/message-status` | `update-webhook-message-status` |
| `/on-send` | `update-webhook-delivery` |
| `/connected` | `update-webhook-connected` |
| `/disconnected` | `update-webhook-disconnected` |
| (todos — alternativa) | `update-every-webhooks` |
