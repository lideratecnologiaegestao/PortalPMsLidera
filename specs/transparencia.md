# Spec — Transparência

## 1. Objetivo
Portal da Transparência (transparência ativa) com dados financeiros atualizados e exportação em dados abertos.

## 2. Conformidade legal
**LC 131/2009 + LRF (LC 101/2000):** receitas/despesas em tempo real (≤ 24h), licitações, contratos, convênios, folha, diárias, PPA/LDO/LOA, RREO/RGF; dados abertos legíveis por máquina.

## 3. Requisitos funcionais
1. Ingerir dados do sistema contábil do tenant via n8n (conector por fornecedor).
2. Normalizar para modelo canônico `transp_*`.
3. Publicar no portal (ISR) com data da última atualização por conjunto.
4. Exportar CSV e JSON; expor API pública com dicionário de dados e licença aberta.
5. Busca e filtros por período/órgão/credor.

## 4. Não-funcionais
Idempotência do ETL (sem duplicar); cache agressivo; p95 baixo via ISR; acessibilidade das tabelas/exportações.

## 5. Modelo de dados
Tabelas `transp_receitas`, `transp_despesas`, `transp_licitacoes`, `transp_contratos`, `transp_folha` (todas com `tenant_id` + RLS + índices por período). Chave natural por exercício/empenho.

## 6. Contrato de API
- `GET /api/transparencia/despesas?ano=&orgao=&page=` (público).
- `GET /api/transparencia/despesas.csv` / `.json` (dados abertos).
- Análogos para receitas, licitações, contratos, folha.

## 7. Fluxos
ETL em `docs/03-fluxos.md`; skill `transparencia-dados-abertos`.

## 8. Integrações
n8n (origem contábil), fila `integracoes` (`JOB_TRANSPARENCIA_SYNC`), cache/ISR.

## 9. LGPD/GDPR

### Folha de pagamento (`transp_folha`)

Base legal: LGPD art. 7º, II (obrigação legal — LC 131/2009 c/c LRF). Fundamento jurisprudencial: STF ARE 652.777 (Tema 484).

**Colunas publicadas pelo endpoint público `/api/transparencia/folha`:**

| Campo retornado | Observação |
|----------------|------------|
| `exercicio` | Publicar integralmente |
| `mes` | Publicar integralmente |
| `matricula_mascarada` | Últimos 4 chars precedidos de `****`. Ex.: `****1234`. Não publicar matrícula completa. |
| `nome_servidor` | Publicar. STF ARE 652.777. |
| `cargo` | Publicar integralmente |
| `vinculo` | Publicar integralmente |
| `orgao` | Publicar integralmente |
| `remuneracao_bruta` | Publicar integralmente |
| `descontos` | Publicar integralmente |
| `remuneracao_liquida` | Publicar integralmente |

**Não publicar:** `id`, `tenant_id`, `fonte_origem`, `atualizado_em`.

A lógica de mascaramento de matrícula e a projeção de campos devem viver na camada de serviço (`TransparenciaService`), nunca no frontend. Ver `docs/06-lgpd-gdpr.md` — seção "Transparência da folha e documentos".

### Documentos de credores (`credor_doc`, `fornecedor_doc`)

- CNPJ (14 dígitos): publicar integralmente.
- CPF (11 dígitos): aplicar máscara `***.NNN.NNN-**` (dígitos 4–9 visíveis; primeiros 3 e verificadores mascarados). Lógica no serviço do backend.
- Nulo ou formato inválido: retornar `null`.

Detalhes e fundamento em `docs/06-lgpd-gdpr.md` — seção "Documentos de credores/fornecedores".

## 10. Critérios de aceite
- Carga reprocessada não duplica; defasagem ≤ 24h exibida.
- CSV/JSON/API batem com o portal; dicionário publicado.
- Teste de isolamento RLS nas tabelas `transp_*`.

## 11. Fora de escopo
Conector para todo ERP do mercado (entregar por fornecedor sob demanda).
