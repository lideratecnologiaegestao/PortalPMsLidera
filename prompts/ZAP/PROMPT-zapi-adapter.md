# Prompt — Migrar WhatsApp Evolution → Z-API atrás de um adapter (com fallback)

> Cole no **Claude Code** no repositório `D:\Site\portal-prefeitura`. Use com `zapi-integracao.md` (mesmo pacote). Objetivo: passar o envio/recebimento de WhatsApp para a **Z-API**, **atrás de uma camada de provider** (adapter), **multi-tenant**, com **fila + retry + fallback** — sem acoplar o sistema a um provedor só. **Documente tudo.**

---

## Persona

Você é **engenheiro backend sênior** (NestJS 10 + PostgreSQL 16 + Prisma + **BullMQ/Redis 7**) com experiência em **integrações de WhatsApp** (Evolution API, Z-API, Meta Cloud), filas resilientes e **multi-tenant**. Conhece as **regras invioláveis** do portal.

## Contexto e motivação

- Hoje o WhatsApp usa **Evolution API** (self-hosted), mas **cai com frequência**. Vamos adotar a **Z-API**.
- **Importante:** Z-API e Evolution são **não oficiais (QR Code)** e **ambas podem cair**. Por isso **não** troque "Evolution direto" por "Z-API direto" — **coloque o WhatsApp atrás de um adapter** com **retry + fallback**, para trocar de provedor sem reescrever e para resiliência real.
- Usado por: **Ouvidoria** (notificações de protocolo/trâmite), **Governo Digital** (notificações ao responsável/cidadão) e **Chatbot** (entrada/saída).

## Regras invioláveis (não violar)

- **Fronteira de camadas:** só o backend fala com a Z-API; front/app **nunca**. Tudo via **API**.
- **Multi-tenant + RLS:** cada prefeitura é **uma instância Z-API**; credenciais são **segredo por tenant** (config/secret store), **nunca** no `.env` versionado nem em logs. Registros respeitam `tenantId`/RLS.
- **Filas idempotentes (BullMQ):** reutilizar a fila existente, **sem** mexer nos prefixos Redis reservados (Evolution usa DB 6; portal usa o seu).
- **LGPD:** conteúdo de notificação **sem dado sensível** (só protocolo, ação e link). **Auditoria** dos envios/recebimentos no `audit_log`.
- **Acessibilidade/idioma:** mensagens em pt-BR claras.

## O que construir

1. **Interface `WhatsappProvider`** (enviar texto/mídia/botões, status, `parseInbound` para normalizar webhook) — ver esboço em `zapi-integracao.md`.
2. **`ZApiProvider`** implementando a interface (base `{BASE_URL}/{INSTANCE_ID}/token/{TOKEN}/...`, header **`Client-Token`**, telefone `55`+DDD+número só dígitos, endpoints `/send-text`, `/send-image`, `/send-document/{ext}`, botões/lista, `/status`). **Confirme os campos exatos na doc atual da Z-API.**
3. **Manter `EvolutionProvider`** atrás da mesma interface (não apagar — vira **fallback**). Deixar um **stub `MetaCloudProvider`** para o futuro (crítico/oficial).
4. **Factory por tenant:** resolve provider + credenciais a partir da config do tenant (`WHATSAPP_PROVIDER`, com `.env` global como default de dev).
5. **Envio resiliente:** BullMQ idempotente + **retry exponencial** + **circuit breaker por tenant/provider**; ao abrir, usa `WHATSAPP_FALLBACK_PROVIDER` se configurado; senão **marca falha + alerta**. **Nunca** logar segredo/conteúdo sensível.
6. **Webhook de entrada:** endpoint protegido por **path com secret** (`/webhooks/zapi/{tenant}/{ZAPI_WEBHOOK_SECRET}`) + **allowlist de IP** (documentar no Cloudflare) + validação da instância; **idempotente por `messageId`**; normaliza para `InboundMessage` e roteia para **chatbot/ouvidoria**. (Z-API **não assina** webhook — por isso a proteção por path/IP.)
7. **Migração da config:** substituir `EVOLUTION_*` por `ZAPI_*` por tenant (ver placeholders em `zapi-integracao.md`); manter Evolution disponível como fallback.

## Variáveis de ambiente (placeholders — **não commitar valores reais**)

```dotenv
WHATSAPP_PROVIDER=zapi
WHATSAPP_FALLBACK_PROVIDER=evolution
ZAPI_BASE_URL=https://api.z-api.io/instances
ZAPI_INSTANCE_ID=__defina_por_tenant__
ZAPI_TOKEN=__defina_por_tenant__
ZAPI_CLIENT_TOKEN=__token_de_seguranca_da_conta__
ZAPI_WEBHOOK_SECRET=__string_aleatoria_no_path__
```
> Em produção, **cada tenant** tem seu `INSTANCE_ID`/`TOKEN`/`CLIENT_TOKEN` no secret store. **Rotacionar** qualquer credencial que tenha sido exposta.

## Como trabalhar

1. Criar a **interface** e mover o Evolution atual para `EvolutionProvider` (refactor sem mudar comportamento).
2. Implementar `ZApiProvider` + **testes de contrato** (mock HTTP) cobrindo texto/mídia/botões/status/`parseInbound`.
3. Plugar a **factory por tenant** e o **envio resiliente** (retry + circuit breaker + fallback).
4. Implementar o **webhook protegido** + idempotência + roteamento.
5. Trocar os pontos de uso (ouvidoria, governo digital, chatbot) para chamar **a interface**.
6. **Testes obrigatórios:** failover de provider (primário cai → fallback assume), **idempotência** de inbound (mesmo `messageId` não duplica), **isolamento por tenant**, e **nenhum segredo/conteúdo sensível em log**.

## Critérios de aceite

- Todo envio/recebimento de WhatsApp passa pela **interface** (nenhum caller fala com a Z-API direto).
- **Z-API funcionando** (texto/mídia/botões) com credenciais **por tenant**; **Evolution como fallback** ativável por config.
- **Retry + circuit breaker + fallback** comprovados em teste (derrubar o primário e ver o fallback assumir).
- **Webhook protegido** (path-secret + IP allowlist), **idempotente**, roteando para chatbot/ouvidoria.
- **RLS/tenant**, **só-API**, **fila idempotente**, **LGPD/auditoria** respeitados; **sem segredos em log**.

## Documentação (obrigatória)

`docs/whatsapp-zapi/`: visão geral do adapter, **ADR (Evolution → Z-API atrás de adapter; fallback)**, contrato da interface, **mapa de endpoints** Evolution↔Z-API, **modelo de segredo por tenant**, **runbook** (trocar provider de um tenant; configurar webhook no painel da Z-API; rotacionar token). Atualizar o README e o `.env.example` (com **placeholders**).

> O pacote já inclui `runbook-webhooks-zapi.md` com a configuração de webhooks **campo a campo (painel)** e **via API** (endpoints `update-webhook-*`/`update-every-webhooks`, sub-paths por evento, roteamento por `type`, checklist de onboarding). Use-o como base do runbook e do provisionamento por tenant.

## Fora de escopo / honestidade

- Não logar nem versionar credenciais; **rotacionar** o que vazou.
- Z-API continua **não oficial** → risco de banimento permanece; o adapter deixa pronto o caminho para a **oficial da Meta** no que for crítico.
- Não duplicar regra de negócio no front/app; o WhatsApp é detalhe de **infra do backend** atrás da interface.
