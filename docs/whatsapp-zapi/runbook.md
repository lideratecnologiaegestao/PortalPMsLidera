# Runbook Operacional — Adapter de WhatsApp

> Base: `prompts/ZAP/runbook-webhooks-zapi.md`, adaptado a implementacao real. Confirme endpoints da Z-API em `developer.z-api.io` se houver mudanca de versao.

**Pre-requisito de infra:** o backend precisa estar acessivel via HTTPS publico (tunel Cloudflare). A Z-API so aceita webhook HTTPS. O endpoint responde 200 imediatamente e processa assincronamente.

---

## 1. Onboarding de uma prefeitura

### Passo 1 — Criar instancia na Z-API

No painel Z-API (`app.z-api.io`):

1. Clique em **Nova instancia**.
2. Anote o `instanceId` e o `token` gerados.
3. Se a conta tem **Seguranca da conta** habilitada, va em **Seguranca** e copie o **Client-Token**. Sem ele, todas as chamadas retornam 400.

Guarde os tres valores como segredo do tenant. Nunca commite em repositorio.

### Passo 2 — Gerar o `webhookSecret`

O segredo e gerado automaticamente pelo `WhatsappConfigService` quando voce salva a config com `provider=zapi`. Nao e necessario gera-lo manualmente.

### Passo 3 — Salvar config no backend

```http
PUT /api/admin/whatsapp/config
Authorization: Bearer <token-admin-prefeitura>
Content-Type: application/json

{
  "provider": "zapi",
  "fallbackProvider": "evolution",
  "zapiInstanceId": "SEU_INSTANCE_ID",
  "zapiToken": "SEU_TOKEN",
  "zapiClientToken": "SEU_CLIENT_TOKEN"
}
```

A resposta inclui `zapiWebhookSecretDefinido: true` confirmando que o secret foi gerado. Os tokens sao cifrados antes de gravar.

Se a Evolution estiver configurada globalmente via env, o fallback funciona sem configuracao adicional de banco.

### Passo 4 — Provisionar webhooks na Z-API

```http
POST /api/admin/whatsapp/provisionar-webhooks
Authorization: Bearer <token-admin-prefeitura>
Content-Type: application/json

{}
```

Este endpoint chama `PUT update-webhook-*` na Z-API para cada evento, configurando as URLs:

```
/api/webhooks/zapi/{slug}/{webhookSecret}/on-receive
/api/webhooks/zapi/{slug}/{webhookSecret}/message-status
/api/webhooks/zapi/{slug}/{webhookSecret}/on-send
/api/webhooks/zapi/{slug}/{webhookSecret}/connected
/api/webhooks/zapi/{slug}/{webhookSecret}/disconnected
```

onde `{slug}` e o slug do tenant (ex.: `exemplo`) e `{webhookSecret}` e o segredo gerado no Passo 3.

A resposta lista o status de cada endpoint:
```json
{
  "ok": true,
  "resultados": {
    "update-webhook-received": "ok",
    "update-webhook-message-status": "ok",
    "update-webhook-delivery": "ok",
    "update-webhook-connected": "ok",
    "update-webhook-disconnected": "ok"
  }
}
```

Se algum retornar erro em vez de `"ok"`, o provisionamento falhou para aquele evento — verificar Client-Token e conectividade.

**Alternativa — uma URL unica:**

```http
POST /api/admin/whatsapp/provisionar-webhooks
{ "useEveryWebhook": true }
```

Usa `update-every-webhooks` com URL sem sub-path. O backend discrimina o evento pelo campo `type` do payload.

### Passo 5 — Configurar toggles no painel Z-API

Acesse **Webhooks e configuracoes gerais** na instancia:

| Campo | Valor | Motivo |
|---|---|---|
| **Ao receber** | `.../on-receive` | Essencial — mensagens do cidadao |
| **Receber status da mensagem** | `.../message-status` | Entregue/lido — auditoria |
| **Ao conectar** | `.../connected` | Saude da instancia |
| **Ao desconectar** | `.../disconnected` | Detecta queda → fallback |
| **Ao enviar** | `.../on-send` | Opcional — confirmacao de envio |
| **Presenca do chat** | *(vazio)* | Barulhento — nao usar |

**Configuracoes do WhatsApp:**
- **Rejeitar chamadas automatico = ON** (evita acumulacao de chamadas nao atendidas)
- **Ler mensagens automatico = OFF** (preserva sinal de nao-lida para o atendente)
- **Ler status automaticamente = OFF**

**Configuracoes gerais:**
- **Desabilitar enfileiramento quando desconectado = OFF** (a fila Z-API serve de rede de seguranca em quedas rapidas; quedas longas disparam o webhook `disconnected` e o fallback do backend)

### Passo 6 — Conectar o numero (QR Code)

No painel Z-API, clique em **Conectar** e escaneie o QR Code com o WhatsApp do numero da prefeitura. Apos a conexao, o webhook `ConnectedCallback` sera disparado e registrado no `audit_log` (`WHATSAPP_CONECTADO`).

### Passo 7 — Verificar status

```http
GET /api/admin/whatsapp/status
Authorization: Bearer <token-admin-prefeitura>
```

Resposta esperada quando conectado:
```json
{ "conectado": true, "detalhe": "connected" }
```

### Passo 8 — Enviar mensagem de teste

```http
POST /api/admin/whatsapp/enviar-teste
Authorization: Bearer <token-admin-prefeitura>
Content-Type: application/json

{ "numero": "65999990000", "texto": "Teste de configuracao — Portal Municipal." }
```

O numero sera mascarado no `audit_log`. Confirme o recebimento no celular.

---

## 2. Configuracao de webhooks no painel Z-API (campo a campo)

Se o provisionamento automatico (Passo 4) nao estiver disponivel, configure manualmente:

| Campo no painel | URL a colar |
|---|---|
| **Ao receber** | `https://<API_PUBLICA>/api/webhooks/zapi/{slug}/{webhookSecret}/on-receive` |
| **Receber status da mensagem** | `https://<API_PUBLICA>/api/webhooks/zapi/{slug}/{webhookSecret}/message-status` |
| **Ao enviar** | `https://<API_PUBLICA>/api/webhooks/zapi/{slug}/{webhookSecret}/on-send` |
| **Ao conectar** | `https://<API_PUBLICA>/api/webhooks/zapi/{slug}/{webhookSecret}/connected` |
| **Ao desconectar** | `https://<API_PUBLICA>/api/webhooks/zapi/{slug}/{webhookSecret}/disconnected` |

Para obter o `webhookSecret` do tenant, consulte o banco (coluna `zapi_webhook_secret` em `tenant_whatsapp_config`) ou o campo `zapiWebhookSecretDefinido` da resposta mascarada da API (apenas confirma existencia, nao expoe o valor).

---

## 3. Trocar o provider de um tenant

Para migrar um tenant de `evolution` para `zapi` (ou vice-versa):

```http
PUT /api/admin/whatsapp/config
{ "provider": "zapi", "fallbackProvider": "evolution" }
```

Ou para reverter:

```http
PUT /api/admin/whatsapp/config
{ "provider": "evolution", "fallbackProvider": "zapi" }
```

A mudanca e imediata — o `WhatsappService` invalida o cache de provider ao detectar mudanca na assinatura de config.

---

## 4. Rotacionar token Z-API

1. Gere novo token no painel Z-API (Configuracoes da instancia → Regenerar token).
2. Atualize via API:
   ```http
   PUT /api/admin/whatsapp/config
   { "zapiToken": "NOVO_TOKEN" }
   ```
3. Confirme no `audit_log` (`WHATSAPP_CONFIG_ATUALIZADA`).
4. Se o `zapiWebhookSecret` tambem foi comprometido, a URL do webhook mudara apos o proximo `PUT`. Execute novamente `POST /api/admin/whatsapp/provisionar-webhooks` para atualizar o painel Z-API.

---

## 5. Diagnostico de problemas comuns

### `GET /admin/whatsapp/status` retorna `conectado: false`

| Causa provavel | Verificar |
|---|---|
| Numero desconectado (QR expirou) | Acessar painel Z-API → reconectar |
| `zapiClientToken` ausente ou incorreto | Config mascarada: `zapiClientTokenDefinido: false` → `PUT /config` com `zapiClientToken` |
| `zapiInstanceId` ou `zapiToken` errados | `zapiTokenDefinido: true` mas status falha → revogar e regenerar token |
| Instancia Z-API nao existe | Verificar `instanceId` no painel Z-API |

### Canal aparece como "desabilitado" no frontend mas o envio funciona

O getter `WhatsappService.habilitado` (usado por `ContatosService.obter()`) avalia as variaveis de ambiente globais. Para Z-API, exige `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN` **e** `ZAPI_CLIENT_TOKEN` definidos — mesmo que o envio em si trate `clientToken` como opcional. Com `ZAPI_CLIENT_TOKEN` vazio no env, `habilitado` retorna `false` mesmo que o numero esteja conectado e enviando. Para corrigir: defina `ZAPI_CLIENT_TOKEN` no env (mesmo que a conta nao exija, use um valor qualquer nao-vazio) ou configure por tenant via banco.

### Status 400 nas chamadas de envio

A Z-API retorna 400 quando:
- `Client-Token` ausente em conta com "Seguranca da conta" habilitada.
- Numero de telefone em formato invalido (o `ZApiProvider` normaliza automaticamente para `55DDD...` sem digitos especiais; verificar se o numero bruto esta correto).
- Instancia desconectada (envio rejeitado — conectar o numero primeiro).

### Circuit breaker aberto (falhas frequentes)

O circuit breaker abre apos 5 falhas em 2 minutos e permanece aberto por 1 minuto. Enquanto aberto, os envios vao direto para o fallback.

Para verificar o estado no Redis:
```bash
redis-cli GET "wa:cb:{tenantId}:{provider}"        # contador de falhas
redis-cli GET "wa:cb:{tenantId}:{provider}:aberto"  # '1' se aberto
```

Para resetar manualmente (forcado):
```bash
redis-cli DEL "wa:cb:{tenantId}:zapi"
redis-cli DEL "wa:cb:{tenantId}:zapi:aberto"
```

### Mensagem recebida duplicada

A idempotencia e garantida por `wa:in:{messageId}` em Redis (TTL 24 h, flag `NX`). Se uma mensagem for processada duas vezes, significa que o `messageId` mudou entre as tentativas do provider (raro). Verificar os logs do `WhatsappWebhookController` com nivel DEBUG.

### Webhook nao chegando ao backend

Cheque em ordem:
1. URL do webhook no painel Z-API esta correta (slug e secret corretos, HTTPS, path com `/api/`).
2. O Cloudflare nao esta bloqueando o IP da Z-API (ver secao de borda abaixo).
3. O backend esta acessivel na porta correta via tunel Cloudflare.
4. O `zapiWebhookSecret` no path corresponde ao gravado no banco.

---

## 6. Borda Cloudflare — allowlist de IP para o webhook

A Z-API nao assina o payload do webhook (sem HMAC). A protecao e feita por:

1. **Path-secret** — o `zapiWebhookSecret` no path, comparado por `timingSafeEqual`.
2. **Allowlist de IP** — o WAF do Cloudflare deve liberar os IPs de saida da Z-API para a rota `/api/webhooks/zapi/*`.

Para configurar no Cloudflare, consulte `docs/operacao/borda-cloudflare-waf-geo.md`. Os IPs de saida da Z-API estao listados em `developer.z-api.io` (secao Webhooks → IPs). Crie uma regra WAF do tipo "Skip" para esses IPs na rota `/api/webhooks/zapi/*` para evitar que o rate limiting ou regras OWASP bloqueiem os callbacks.

Sem allowlist, um WAF em modo Block pode rejeitar os webhooks silenciosamente, gerando perda de mensagens sem erro aparente no backend.

---

## 7. Estado atual (ambiente Lidera / Exemplolandia)

| Item | Status |
|---|---|
| `WHATSAPP_PROVIDER` | `zapi` (env global) |
| `WHATSAPP_FALLBACK_PROVIDER` | `evolution` (env global) |
| `ZAPI_INSTANCE_ID` | Configurado via env |
| `ZAPI_TOKEN` | Configurado via env |
| `ZAPI_CLIENT_TOKEN` | **Vazio** — preencher se a conta exigir "Seguranca da conta" |
| Numero conectado (QR) | **Pendente** |
| Webhooks provisionados no painel Z-API | **Pendente** |
| Allowlist de IP da Z-API no Cloudflare | **Pendente** |

**Proximos passos para ativar em producao:**

1. Verificar se a conta Z-API exige `Client-Token` → se sim, `PUT /api/admin/whatsapp/config { "zapiClientToken": "..." }`.
2. Conectar o numero via QR Code no painel Z-API.
3. Executar `POST /api/admin/whatsapp/provisionar-webhooks` (ou configurar manualmente no painel).
4. Configurar allowlist de IP da Z-API no Cloudflare WAF.
5. Validar com `GET /api/admin/whatsapp/status` e `POST /api/admin/whatsapp/enviar-teste`.
