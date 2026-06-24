# ADR-0008 — Resolver de Campanhas: Precedência Determinística + Cache Redis

**Status:** Aceito  
**Data:** 2026-06  
**Módulo:** Campanhas — `GET /api/campanhas/ativas`

---

## Contexto

O portal pode ter múltiplas campanhas ativas simultaneamente (ex.: Setembro Amarelo + Dengue). Algumas capacidades são exclusivas (só um tema pode controlar o portal por vez; só um popup é exibido para não sobrecarregar o usuário). Outras podem coexistir (múltiplas faixas ou banners enriquecem o portal sem conflito). O frontend precisa de um contexto já resolvido — sem lógica de precedência no cliente.

O endpoint é chamado em toda renderização SSR/ISR do portal público. Tem que ser rápido e não sobrecarregar o banco.

---

## Decisão

**Resolver no backend:** `GET /api/campanhas/ativas` (sem auth, por Host/tenant) executa a lógica de precedência no servidor e devolve um contexto pronto.

**Precedência determinística por `prioridade` (integer):** maior número = maior precedência. Empate desempata por `criado_em DESC`. A regra é simples e previsível — o admin sabe exatamente o que vai acontecer ao subir ou descer a prioridade.

**Tetos por capacidade:** `tema = 1`, `popup = 1`, `efeito = 1`, `faixa = 2`, `banner = 3`, `selo = 3`, `pagina = sem teto`. Os tetos evitam poluição visual sem precisar de lógica complexa de agrupamento.

**Cache Redis TTL 60s:** chave `campanhas:ativas:<tenantId>`. Toda mutação admin invalida imediatamente via `cache.del()`. O TTL é um safety net para o caso de invalidação falhar.

**Tolerância no frontend:** o `CampanhaRenderer` ignora capacidades malformadas silenciosamente — nunca quebra o portal por dados inconsistentes.

---

## Consequências

- Frontend simples: apenas consome o contexto e renderiza, sem lógica de conflito.
- Comportamento previsível: o admin controla precedência via campo numérico.
- Cache Redis limita o número de queries ao banco em picos de tráfego.
- Latência máxima de 60s para propagação de mudanças (aceitável para campanhas com período de dias/semanas).
- Invalida o cache em toda mutação → under load intenso de edições pode gerar spikes de queries. Mitigação: o TTL de 60s absorve a maioria.
- Se o Redis estiver indisponível, o resolver executa sem cache — degradação elegante com custo de latência extra.

---

## Alternativas consideradas

**SSE / WebSocket para push de invalidação:** o portal se inscreveria e receberia o contexto em tempo real. Rejeitado para a Fase 1 por complexidade operacional desnecessária — campanhas mudam com frequência de horas/dias, não segundos.

**Cache no Next.js (ISR `revalidate`):** cacheamento na borda, sem depender do Redis. Rejeitado porque não invalida imediatamente ao mudar status no admin (ISR tem granularidade de rota, não de tenant).

**Lógica de precedência no frontend:** o cliente receberia todas as campanhas ativas e decidiria o que exibir. Rejeitado porque viola o princípio de fronteira de camadas (o frontend não deve ter regra de negócio), e aumenta o risco de inconsistência entre clientes.

**Prioridade por categoria (saude > civico > sazonal):** precedência automática sem campo numérico. Rejeitado porque restringe a flexibilidade — o admin não conseguiria promover uma campanha fiscal acima de uma de saúde em situação específica.
