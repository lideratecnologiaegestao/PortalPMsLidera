# Integração WhatsApp — Z-API atrás de adapter (referência técnica)

Apoio ao `PROMPT-zapi-adapter.md`. **Não troque "Evolution direto" por "Z-API direto"** — coloque o WhatsApp atrás de uma **interface de provider** com **fila + retry + fallback**. Os detalhes exatos de endpoint/campos da Z-API **devem ser confirmados na doc oficial atual** (mudam com o tempo).

## Modelo de segredo por tenant
Cada prefeitura = **uma instância Z-API** (`instanceId` + `token` + `clientToken`). Guardar como **segredo por tenant** (secret store / config de tenant), **nunca** no `.env` versionado. O `.env` global só serve de **default no dev single-tenant**.

## Variáveis (placeholders — não commitar valores reais)
```dotenv
# Seleção de provider (por tenant; global como default de dev)
WHATSAPP_PROVIDER=zapi              # zapi | evolution
WHATSAPP_FALLBACK_PROVIDER=evolution   # opcional (resiliência)

# Z-API (por tenant em produção; aqui apenas como default de dev)
ZAPI_BASE_URL=https://api.z-api.io/instances
ZAPI_INSTANCE_ID=__defina_por_tenant__
ZAPI_TOKEN=__defina_por_tenant__
ZAPI_CLIENT_TOKEN=__token_de_seguranca_da_conta__     # enviado no header Client-Token
ZAPI_WEBHOOK_SECRET=__string_aleatoria_no_path_do_webhook__
```

## Interface do provider (esboço TS)
```ts
export interface WhatsappProvider {
  sendText(to: string, message: string): Promise<SendResult>;
  sendMedia(to: string, media: MediaInput, caption?: string): Promise<SendResult>;
  sendButtons?(to: string, payload: ButtonsInput): Promise<SendResult>;
  getStatus(): Promise<ProviderStatus>;
  parseInbound(raw: unknown): InboundMessage | null; // normaliza o webhook
}
```
Uma **factory** resolve, por **tenant**, qual provider usar e com quais credenciais. O resto do sistema (ouvidoria, governo digital, chatbot) chama **a interface**, nunca a Z-API direto.

## Z-API — forma das chamadas (confirmar na doc atual)
- **Base:** `{ZAPI_BASE_URL}/{ZAPI_INSTANCE_ID}/token/{ZAPI_TOKEN}/<acao>`
- **Header:** `Client-Token: {ZAPI_CLIENT_TOKEN}` nas requisições.
- **Telefone:** `55` + DDD + número, **só dígitos** (ex.: `5565999990000`).
- **Texto:** `POST /send-text` → `{ phone, message }`
- **Mídia:** `POST /send-image`, `POST /send-document/{ext}` → `{ phone, image|document (url ou base64), fileName?, caption? }`
- **Botões/lista:** `POST /send-button-list` (ou `/send-option-list`), conforme a doc.
- **Status/conexão:** `GET /status`; pareamento: `GET /qr-code`.

## Webhook (entrada)
- Configurar (painel/endpoint) os eventos: **mensagem recebida**, **status** (enviado/recebido/lido), **conexão**.
- A Z-API **não assina** o webhook → **proteger o endpoint**:
  - **path com secret não-adivinhável**: `/webhooks/zapi/{tenant}/{ZAPI_WEBHOOK_SECRET}`
  - **allowlist de IP** (Cloudflare) e **validação da instância** no payload.
- **Idempotência** por `messageId` (não processar duas vezes).
- Normalizar para `InboundMessage` interno → roteia para **chatbot/ouvidoria**.

## Envio resiliente (o coração do "não cair")
- Mantém o envio na **BullMQ idempotente** já existente (sem mexer nos prefixos Redis reservados) + **retry exponencial**.
- **Circuit breaker por tenant/provider**: ao abrir (várias falhas), usa `WHATSAPP_FALLBACK_PROVIDER` se configurado; senão **marca falha + alerta**.
- **Nunca logar** `token`/`clientToken`/conteúdo sensível.

## Mapa Evolution → Z-API (conceitual)
| Ação | Evolution (atual) | Z-API |
|---|---|---|
| Enviar texto | `/message/sendText/{instance}` (header `apikey`) | `/send-text` (header `Client-Token`) |
| Enviar mídia | `/message/sendMedia/...` | `/send-image`, `/send-document/{ext}` |
| Mensagem recebida | evento/webhook configurado | `on-message-received` |
| Status/conexão | `/instance/connectionState` | `/status` |

> Como ambos são **não oficiais (QR Code)**, mantenha o adapter pronto para plugar a **API oficial da Meta** no que for crítico — sem retrabalho.
