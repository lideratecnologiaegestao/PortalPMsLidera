# Spec — ESIC (Acesso à Informação)

## 1. Objetivo
Permitir que qualquer pessoa solicite informação pública à prefeitura e acompanhe o pedido, com os prazos e recursos da LAI.

## 2. Conformidade legal
**LAI (Lei 12.527/2011):** resposta em **20 dias**, prorrogável por **+10** com justificativa; instâncias recursais; classificação de sigilo; gratuidade (custo só de reprodução). Recurso decidido em **5 dias** pela autoridade.

## 3. Requisitos funcionais
1. Registrar pedido (autenticado gov.br; nível mínimo configurável por tenant).
2. Triagem e encaminhamento à secretaria responsável.
3. Responder, indeferir (com fundamento legal) ou atender parcialmente.
4. Prorrogar com justificativa (+10 dias).
5. Interpor e julgar recurso de 1ª e 2ª instância.
6. Acompanhamento por protocolo + notificações.
7. Classificação/controle de sigilo (reservada/secreta/ultrassecreta).

## 4. Não-funcionais
SLA monitorado por fila; trilha imutável de eventos; acessibilidade AA nos formulários; resposta pública quando não sigilosa.

## 5. Modelo de dados
`manifestacoes` (canal=`esic`), `manifestacao_eventos`, `manifestacao_anexos` — ver `db/004_manifestacoes.sql`. RLS por tenant já aplicado.

## 6. Contrato de API
- `POST /api/manifestacoes` — registrar (público/autenticado). Body: `{canal:'esic', tipo:'acesso_informacao', assunto, descricao, solicitante...}`.
- `GET /api/manifestacoes/:id/acoes` — eventos válidos (role interna).
- `POST /api/manifestacoes/:id/eventos/:evento` — transição (role: ouvidor/gestor/admin). Body: `{observacao, atorId}`.

## 7. Fluxos
FSM e SLA em `docs/03-fluxos.md` e skill `manifestacoes-fsm-sla`.

## 8. Integrações
Fila `manifestacao-sla` (alerta/vencimento), fila `notificacoes`. IA opcional para sugerir secretaria/resposta (revisão humana).

## 9. LGPD/GDPR
Base legal: obrigação legal (LAI). Minimização do solicitante; dados de sigilo protegidos; retenção conforme tabela de temporalidade do órgão.

## 10. Critérios de aceite
- Pedido registra, transita e dispara SLA (alerta 80% + vencimento).
- Prorrogação estende o prazo; recurso muda de instância (só ESIC).
- Transição inválida é rejeitada; evento imutável gravado.
- Teste de isolamento RLS (tenant A ≠ B).

## 11. Fora de escopo
Integração com e-SIC federal; cobrança de custo de reprodução.
