# Spec — IA Assistida

## 1. Objetivo
Usar IA para acelerar atendimento e busca, sempre com revisão humana e base oficial.

## 2. Conformidade legal
LGPD/GDPR para decisão automatizada (revisão humana, contestação); DPIA quando processa dado pessoal em escala.

## 3. Requisitos funcionais
1. Triagem/classificação de manifestações (tipo, secretaria sugerida, prioridade) — sugestão, não decisão final.
2. Busca semântica (RAG) sobre transparência e Carta de Serviços.
3. Chatbot que responde a partir da base oficial (com citação da fonte).
4. OCR de documentos anexados (ESIC/chamados).

## 4. Não-funcionais
Latência aceitável (assíncrono onde couber); custo controlado; respostas rastreáveis à fonte; sem alucinação como ato oficial.

## 5. Modelo de dados
Índices/embeddings derivados das tabelas oficiais (`transp_*`, serviços), com `tenant_id` + RLS. Logs de uso de IA em `audit_log`.

## 6. Contrato de API
- `POST /api/ia/triagem` (interno) — sugere classificação para uma manifestação.
- `POST /api/ia/busca` (público) — RAG com citações.
- `POST /api/ia/chat` (público) — chatbot.

## 7. Fluxos
Documento/manifestação → fila `integracoes` (`JOB_IA_TRIAGEM`) → sugestão → revisão humana. RAG: pergunta → recupera trechos oficiais do tenant → responde com fonte.

## 8. Integrações
API Anthropic; fila `integracoes`; armazenamento de embeddings.

## 9. LGPD/GDPR
Base legal por finalidade; minimização do que vai ao modelo; revisão humana obrigatória em classificação; transferência internacional avaliada; DPIA.

## 10. Critérios de aceite
- Triagem sugere com acurácia medida; humano confirma/ajusta.
- RAG cita fonte oficial do próprio tenant (sem vazar entre tenants — RLS nos índices).
- Logs de IA auditáveis.

## 11. Fora de escopo
Decisão administrativa automática sem humano; geração de ato oficial sem revisão.
