# Spec — Ouvidoria

## 1. Objetivo
Canal para o cidadão registrar denúncia, reclamação, sugestão, elogio e solicitação, com tratamento e resposta no prazo da Lei 13.460/2017.

## 2. Conformidade legal
**Lei 13.460/2017** (Código de Defesa do Usuário do Serviço Público): prazo de **30 dias + 30** de prorrogação; tipos de manifestação; Carta de Serviços ao Usuário; pesquisa de satisfação.

## 3. Requisitos funcionais
1. Registrar manifestação por tipo; **denúncia pode ser anônima**.
2. Triagem, encaminhamento, resposta e conclusão.
3. Prorrogação justificada (+30 dias).
4. Pesquisa de satisfação após conclusão.
5. Acompanhamento por protocolo + notificações.
6. Carta de Serviços publicada.

## 4. Não-funcionais
SLA por fila; anonimato real (não exigir identificação na denúncia); acessibilidade AA.

## 5. Modelo de dados
`manifestacoes` (canal=`ouvidoria`), `manifestacao_eventos`, `manifestacao_anexos` — `db/004_manifestacoes.sql`. RLS aplicado.

## 6. Contrato de API
Mesmos endpoints do ESIC, com `canal:'ouvidoria'` e `tipo` em {denuncia, reclamacao, sugestao, elogio, solicitacao}. Recursos NÃO se aplicam (guard `soEsic`).

## 7. Fluxos
FSM e SLA em `docs/03-fluxos.md`; skill `manifestacoes-fsm-sla`.

## 8. Integrações
Filas `manifestacao-sla` e `notificacoes`. IA opcional para classificação/roteamento (revisão humana).

## 9. LGPD/GDPR
Base legal: interesse público/obrigação legal. Minimização máxima na denúncia anônima; retenção por temporalidade.

## 10. Critérios de aceite
- Cada tipo registra e transita corretamente; denúncia anônima sem PII obrigatória.
- SLA 30+30 dispara alerta e vencimento; pausa/retoma ao aguardar cidadão.
- Recurso é bloqueado (não-ESIC). Teste de isolamento RLS.

## 11. Fora de escopo
Integração com Fala.BR; analytics avançado de satisfação.
