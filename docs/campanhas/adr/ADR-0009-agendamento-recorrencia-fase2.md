# ADR-0009 — Agendamento, Recorrência e Disparo Autônomo (Fase 2)

**Status:** Diferido — implementação Fase 2  
**Data:** 2026-06  
**Módulo:** Campanhas — Scheduler BullMQ

---

## Contexto

Na Fase 1, as transições de status da campanha são manuais: o admin clica em "Ligar"/"Desligar" ou usa `PATCH /status`. O resolver já respeita a janela de datas (`starts_at`/`ends_at`), então uma campanha `active` com data futura simplesmente não aparece no portal — mas o admin precisa lembrar de desligar quando o período acabar.

Para campanhas recorrentes (todos os meses coloridos, sazonais anuais como dengue e agasalho), a gestão manual é frágil: o admin precisa criar ou reativar a campanha a cada ciclo. Prefeituras menores não têm equipe dedicada para isso.

O projeto já usa BullMQ + Redis para outros workers (SLA/ouvidoria, notificações, IA). A infraestrutura está disponível.

---

## Decisão registrada (implementação Fase 2)

Criar `CampanhasSchedulerService` com job BullMQ repetível:

- Intervalo: a cada 15 minutos e à meia-noite (dois jobs: `campaigns:tick` e `campaigns:midnight`).
- Idempotente: `jobId` fixo por job para evitar processamento duplicado.
- Cross-tenant: usa `prisma.platform()` para ler todas as campanhas elegíveis de todos os tenants em uma única passagem.

**Transições automáticas:**

| Condição | Transição | Log |
|----------|-----------|-----|
| `status = scheduled` e `starts_at <= now()` e `autonomous = true` | `→ active` | `autostarted` |
| `status = active` e `ends_at < now()` | `→ ended` | `ended` |
| `status = ended` e `recorrencia.tipo = annual` e `autonomous = true` | recalcula `starts_at`/`ends_at` para o próximo ano e `→ scheduled` | `scheduled` |
| `status = ended` e `recorrencia.tipo = seasonal` e `autonomous = true` | aguarda próximo intervalo MM-DD e `→ scheduled` | `scheduled` |

O flag `autonomous` controla quais campanhas o scheduler gerencia. Campanhas com `autonomous = false` continuam com transições manuais mesmo tendo `recorrencia` definida.

**Cada transição:**
1. Atualiza `campaign.status` e `campaign.starts_at`/`campaign.ends_at` (quando rola a recorrência).
2. Grava em `campaign_activation_log` com `ator = 'scheduler'`.
3. Invalida o cache Redis do tenant afetado.

**Campos já na tabela `campaign` desde a Fase 1:**
- `autonomous boolean NOT NULL DEFAULT false`
- `recorrencia jsonb` — formato `{ tipo, inicio?, fim? }`

Nenhuma migration adicional é necessária para a Fase 2 do scheduler.

---

## Consequências

- A Fase 2 pode ser implementada sem mudança de schema.
- Prefeituras com `autonomous = true` nas campanhas recorrentes têm operação zero-touch.
- O admin mantém controle: pode pausar uma campanha autônoma a qualquer momento via `PATCH /status` (status `paused` nunca é sobrescrito pelo scheduler).
- O job precisa de lock distribuído (Redis) para evitar execução paralela em instâncias múltiplas da API.
- Gera carga de queries no banco no tick a cada 15 min — mitigar com índice `idx_campaign_tenant_status` e filtragem por `autonomous = true AND status IN ('scheduled','active','ended')`.

---

## Alternativas consideradas

**Cron externo (n8n / sistema operacional):** disparar as transições via chamada HTTP a partir do n8n. Rejeitado porque exige configuração fora do código, não tem retry nativo e dificulta o teste.

**Polling no frontend:** o portal verificaria periodicamente e ativaria campanhas. Rejeitado — viola fronteira de camadas e não funciona quando o portal está ocioso.

**Webhook/evento externo por data:** serviço de terceiro (ex.: cron.job) dispara um webhook na API. Rejeitado por dependência externa desnecessária quando o BullMQ já está disponível.

**Implementar na Fase 1:** adiado por critério de escopo. A Fase 1 entrega o valor central (resolver + admin + presets) sem a complexidade do scheduler. O campo `recorrencia` e `autonomous` foram incluídos na migration 084 precisamente para que a Fase 2 não precise de migration adicional.
