# ADR — Migrar WhatsApp: Evolution → Z-API atras de adapter multi-provider com fallback

- **Status:** Aceito e implementado
- **Data:** 2026-06
- **Decisores:** Arquitetura / Backend
- **Arquivo de referencia:** `db/052_whatsapp_provider.sql`, `api/src/modules/whatsapp/`

---

## Contexto

O portal usava a Evolution API auto-hospedada para envio de notificacoes (ESIC/Ouvidoria) e entrada de mensagens do cidadao. A instancia Evolution apresentava quedas frequentes, derrubando o canal de WhatsApp para todos os tenants simultaneamente.

Ambas as opcoes de mercado (Evolution e Z-API) sao **nao oficiais** — baseadas em ponte QR Code, sem garantias de disponibilidade da Meta e com risco de banimento do numero. Qualquer solucao que troque um provider pelo outro diretamente apenas transfere o ponto unico de falha.

Requisitos que guiaram a decisao:

- Resiliencia real: falha de um provider nao deve derrubar o canal inteiro.
- Troca de provider por tenant sem reescrever os callers (Ouvidoria, Atendimento, Auth).
- Caminho preparado para a API oficial da Meta sem retrabalho.
- Isolamento por tenant: cada prefeitura com suas proprias credenciais, armazenadas cifradas.
- Auditoria e LGPD: envios/recebimentos registrados sem dado sensivel.

---

## Decisao

Migrar de Evolution para Z-API **atras de uma interface de provider (`WhatsappProvider`)**, mantendo a Evolution como fallback configuravel. A camada de adapter (`WhatsappService`) gerencia retry, circuit breaker por tenant/provider (Redis) e fallback automatico. Um stub `MetaCloudProvider` prepara o slot para a API oficial da Meta.

A estrutura completa:

```
WhatsappProvider (interface)
  ├── ZApiProvider        ← provider primario
  ├── EvolutionProvider   ← fallback (mantido)
  └── MetaCloudProvider   ← stub [futuro]

WhatsappService           ← adapter publico
  retry (2x, backoff 800 ms)
  circuit breaker por tenant+provider (Redis, 5 falhas / 2 min → aberto por 1 min)
  fallback automatico ao provider secundario
  auditoria LGPD-safe (numero mascarado)

WhatsappConfigService     ← config cifrada por tenant, fallback a env global
```

---

## Alternativas consideradas

### 1. Troca direta Evolution → Z-API (rejeitada)

Substituir o `WhatsappService` monolitico por chamadas Z-API diretas, sem interface.

**Rejeitada porque:** mantem o ponto unico de falha; os callers passam a depender do provider especifico; qualquer nova troca (Z-API → Meta, por instabilidade ou exigencia legal) exige reescrita em varios modulos.

### 2. Apenas Meta Cloud API oficial (adiada)

Migrar diretamente para a API oficial do WhatsApp Business (`graph.facebook.com`), que assina webhooks com HMAC-SHA256 e nao depende de QR Code.

**Nao adotada agora porque:** requer aprovacao de conta Business verificada pela Meta (processo burocrático e oneroso para municipios pequenos), numero de telefone dedicado e custo por mensagem. O adapter prepara o slot (`MetaCloudProvider`) para quando for viavel sem retrabalho.

### 3. Manter Evolution sem mudanca (rejeitada)

**Rejeitada pela causa raiz:** instabilidade documentada que derrubava o canal com frequencia. Nao resolve o problema de resiliencia.

---

## Consequencias

**Positivas**

- Resiliencia real: fallback automatico Evolution assume quando o breaker da Z-API abre.
- Zero retrabalho nos callers ao trocar de provider — chamam `WhatsappService.enviar()`.
- Caminho para Meta Cloud oficial sem alteracao de interface ou callers.
- Credenciais cifradas por tenant (AES-256-GCM); sem tokens em log ou versionados.
- Webhook de entrada idempotente e isolado por tenant.

**Negativas / riscos aceitos**

- Z-API e Evolution continuam nao oficiais. Risco de banimento do numero persiste; o adapter nao elimina esse risco — apenas reduz o impacto operacional.
- Complexidade adicional: circuit breaker em Redis, factory de providers com cache, logica de fallback. Compensado por testes de failover obrigatorios.
- `sendButtons` da Z-API tem fallback interno para texto numerado quando o endpoint `/send-button-list` falha — comportamento documentado e aceitavel enquanto os campos exatos nao forem confirmados na doc atual da Z-API.
- `MetaCloudProvider` e stub — configurar `provider=meta` em producao lanca excecao imediata.

---

## Referencias

- `api/src/modules/whatsapp/whatsapp-provider.interface.ts` — contrato
- `api/src/modules/whatsapp/whatsapp.service.ts` — logica de resiliencia
- `db/052_whatsapp_provider.sql` — schema + RLS
- `prompts/ZAP/PROMPT-zapi-adapter.md` — contexto original da decisao
- `docs/whatsapp-zapi/contrato-interface.md` — mapa de endpoints
- `docs/whatsapp-zapi/runbook.md` — operacao
