# Modelo de Segredo por Tenant

> Descreve a tabela `tenant_whatsapp_config`, como os segredos sao cifrados, a ordem de resolucao (banco → env), e boas praticas de rotacao. Baseado em `db/052_whatsapp_provider.sql` e `api/src/modules/whatsapp/whatsapp-config.service.ts`.

---

## Tabela `tenant_whatsapp_config`

Criada pela migracao `db/052_whatsapp_provider.sql`. Uma linha por tenant (restricao `UNIQUE` em `tenant_id`).

| Coluna | Tipo | Descricao |
|---|---|---|
| `id` | `uuid` | PK gerado automaticamente |
| `tenant_id` | `uuid` | FK para `tenants(id)`, ON DELETE CASCADE |
| `provider` | `text` | Provider ativo: `zapi`, `evolution` ou `meta` |
| `fallback_provider` | `text` | Provider de fallback (opcional) |
| `zapi_instance_id` | `text` | ID da instancia Z-API (nao e segredo) |
| `zapi_token_cifrado` | `text` | Token Z-API cifrado (AES-256-GCM) |
| `zapi_client_token_cifrado` | `text` | Client-Token Z-API cifrado (header de autenticacao de conta) |
| `zapi_webhook_secret` | `text` | String aleatoria usada no PATH do webhook (nao cifrada — e parte da URL) |
| `evolution_api_url` | `text` | URL da instancia Evolution (nao e segredo) |
| `evolution_instance` | `text` | Nome da instancia Evolution |
| `evolution_api_key_cifrado` | `text` | API key Evolution cifrada |
| `ativo` | `boolean` | Flag de ativacao do canal |
| `atualizado_em` | `timestamptz` | Timestamp de ultima atualizacao |
| `criado_em` | `timestamptz` | Timestamp de criacao |

**Constraints:** `twa_provider_chk` e `twa_fallback_chk` limitam os valores aos providers conhecidos (`zapi`, `evolution`, `meta`).

**RLS:** a tabela tem Row Level Security habilitada via `SELECT app_enable_tenant_rls('tenant_whatsapp_config')`. Toda leitura e escrita passa pelo `TenantContext` que define `app.current_tenant_id` na transacao.

---

## Cifragem de segredos

Os campos `*_cifrado` sao protegidos por `api/src/common/crypto/secret-box.util.ts` (AES-256-GCM). A funcao `cifrar()` e chamada no `WhatsappConfigService.salvar()` antes de gravar; `decifrar()` e chamada em `rowParaConfig()` ao ler.

O `WhatsappConfigService` nunca retorna tokens em claro para controladores. O metodo `configMascarada()` expoe apenas flags booleanas (`zapiTokenDefinido`, `zapiClientTokenDefinido`, `evolutionApiKeyDefinida`), para uso nas respostas da API admin.

O campo `zapi_webhook_secret` nao e cifrado porque e parte da URL do webhook (precisa ser comparado em texto plano via `timingSafeEqual`). Ele nao deve aparecer em logs.

---

## Resolucao de configuracao (banco → env)

O `WhatsappConfigService.rowParaConfig()` aplica a seguinte precedencia para cada campo:

```
1. Valor do banco (decifrado)   ← producao multi-tenant
2. Variavel de ambiente global  ← dev / single-tenant
3. Valor padrao hardcoded       ← apenas para campos nao criticos (ex.: provider='evolution')
```

Isso permite que o ambiente de desenvolvimento funcione sem linha no banco, usando apenas o `.env`.

### Variaveis de ambiente suportadas como fallback

```dotenv
WHATSAPP_PROVIDER=zapi
WHATSAPP_FALLBACK_PROVIDER=evolution

ZAPI_BASE_URL=https://api.z-api.io/instances
ZAPI_INSTANCE_ID=__defina_por_tenant__
ZAPI_TOKEN=__defina_por_tenant__
ZAPI_CLIENT_TOKEN=__token_de_seguranca_da_conta__
ZAPI_WEBHOOK_SECRET=__string_aleatoria_no_path__

EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_INSTANCE=__nome_da_instancia__
EVOLUTION_API_KEY=__api_key__
```

Nenhuma dessas variaveis deve ter valor real versionado no repositorio. Use `.env.local` ignorado pelo `.gitignore` ou o secret store do ambiente (Docker secrets, Kubernetes secrets, etc.).

---

## Um tenant = uma instancia Z-API

Cada prefeitura deve ter sua propria instancia Z-API com `instanceId` e `token` exclusivos. Compartilhar instancia entre tenants nao e suportado — o `zapiWebhookSecret` e a validacao de `instanceId` no payload de webhook sao por tenant.

```
Tenant A → instanceId: AAA111, token: ttt-aaa, webhookSecret: abc...
Tenant B → instanceId: BBB222, token: ttt-bbb, webhookSecret: xyz...
```

O `WhatsappService` mantem um cache de instancias de provider por `(tenantId, assinatura-de-config)`. A assinatura muda automaticamente quando `instanceId` ou `token` sao rotacionados, forcando a recriacao do provider sem reinicio do processo.

---

## Boas praticas de seguranca

**Rotacao de credenciais expostas.** Se um token Z-API, `clientToken` ou `evolutionApiKey` vazar (log, commit, etc.):

1. Acesse o painel Z-API e revogue/regenere o token da instancia.
2. Atualize via `PUT /api/admin/whatsapp/config` com o novo valor (o `WhatsappConfigService` cifra e grava automaticamente).
3. Verifique os logs de auditoria (`audit_log` com `acao = 'WHATSAPP_CONFIG_ATUALIZADA'`) para confirmar que a atualizacao foi registrada.

**`zapiWebhookSecret`.** E gerado automaticamente (`randomBytes(32).toString('hex')`) na primeira vez que `provider=zapi` e salvo. Para rotacionar: salve a config novamente com `provider=zapi` e `zapiWebhookSecret` sera regenerado. Apos rotacionar, execute `POST /api/admin/whatsapp/provisionar-webhooks` para atualizar as URLs no painel Z-API.

**`ZAPI_CLIENT_TOKEN` global.** Se a conta Z-API exige "Seguranca da conta", o `Client-Token` e obrigatorio em todas as chamadas. Sem ele, a Z-API retorna 400. Configure por tenant via `PUT /api/admin/whatsapp/config` com `zapiClientToken` ou via `ZAPI_CLIENT_TOKEN` no `.env` para dev.

**Sem segredos em log.** O `WhatsappService` usa `NUNCA logar token/clientToken/conteudo da mensagem` como regra (documentada no codigo). Os logs de auditoria gravam apenas o numero mascarado (`••••XXXX`) e o nome do provider.
