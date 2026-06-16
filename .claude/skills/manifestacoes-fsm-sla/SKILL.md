---
name: manifestacoes-fsm-sla
description: Regras da máquina de estados e dos prazos legais de ESIC (LAI) e Ouvidoria (Lei 13.460) deste projeto. Use SEMPRE que mexer em manifestações, transições de status, prazos, SLA, prorrogação, recursos ou notificações de prazo. Acione a qualquer menção a ESIC, LAI, ouvidoria, manifestação, protocolo, prazo, SLA, recurso ou denúncia.
---

# Manifestações: FSM + SLA

ESIC e Ouvidoria usam um modelo unificado (`canal` = `esic` | `ouvidoria`). O estado só muda via `ManifestacoesService.aplicarEvento()`, que consulta `state-machine.ts` e grava um evento imutável em `manifestacao_eventos`.

## Estados e transições
A tabela `TRANSICOES` em `api/src/modules/manifestacoes/state-machine.ts` é a fonte da verdade. Para adicionar um evento:
1. Adicione a entrada `estado -> evento -> { para, guard?, efeito? }`.
2. Use `guard: soEsic` para transições exclusivas do ESIC (recursos).
3. `efeito` sinaliza o impacto no SLA: `pausa_sla` | `retoma_sla` | `estende_sla` | `encerra_sla`.
4. Cubra com teste: transição válida funciona, inválida é rejeitada.

## Prazos legais (`sla.ts`) — NÃO alterar sem ADR
- **ESIC / acesso à informação (LAI 12.527/2011):** 20 dias + 10 de prorrogação.
- **Ouvidoria (Lei 13.460/2017):** 30 dias + 30.
- **Recurso ESIC (LAI art. 15-16):** autoridade decide em 5 dias.
- `uteis` controla dias úteis vs. corridos; o piso legal é o default, mas é **configurável por tenant** (algumas prefeituras adotam prazos menores). Feriados entram como `Set<string>` (datas ISO) vindo da config do tenant.

## SLA com BullMQ
- No registro, agende dois jobs idempotentes (`jobId` = `sla-alerta-<id>` e `sla-vencido-<id>`): alerta em ~80% do prazo (`instanteAlerta`) e vencimento no `prazoEm`.
- `pausa_sla` (aguardando cidadão): cancele os jobs e grave `sla_pausado_em`.
- `retoma_sla`: recalcule o prazo com `prazoAposPausa()` e reagende.
- `estende_sla` (prorrogar/recurso): some o período e reagende o vencimento.
- `encerra_sla` (respondida/indeferida/concluída): cancele os jobs.
- O worker é **no-op** se a manifestação já está em estado encerrado (fail-safe).

## Sempre
- Gere protocolo sequencial por tenant/ano.
- Denúncia pode ser anônima — não exija identificação.
- Toda transição relevante notifica o cidadão (fila `notificacoes`) e/ou o responsável.
