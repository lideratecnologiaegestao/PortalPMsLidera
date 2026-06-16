# ADR-0002 — Importação de dados contábeis APLIC (TCE-MT) e consumo pela IA

- **Status:** Aceito — formato confirmado e parser validado em dado real (2026-06-14)
- **Data:** 2026-06-14
- **Relacionado:** [[config-por-entidade]], módulo de Transparência (transp_*),
  [[ia-base-conhecimento]], análise de gap do barao (P1: "ETL de transparência fiscal real").

## Contexto

As prefeituras de MT geram, pelo sistema contábil, uma **carga estruturada no leiaute
APLIC** (TCE-MT) com toda a execução orçamentária/contábil. Pedido: importar esses dados
para (a) alimentar a **Transparência ativa** (LC 131/2009) com dados reais — encerrando a
dependência do Agili — e (b) permitir que o **assistente de IA** responda com PRECISÃO
sobre plano de contas, empenhos, liquidações, pagamentos, credores etc.

### Achados da investigação (arquivos reais do APLIC_PREVALIDACAO)
- O **leiaute 2026 é legível por máquina**: `docs/aplic/leiaute/*.CSV` (versionados no repo),
  um por módulo — **CT (Contabilidade)**, FP (Folha), ORÇAMENTO, PROCESSO LICITATÓRIO, CC,
  CARGA INICIAL, ENCERRAMENTO. Cada linha:
  `NOMETABELA;ORDEM;NOMECAMPO;CHAVE;OBRIGATORIO;TIPO;DESCRICAO;TABELAORIGEM;FORMATO;REGRAS`.
  → dá para **gerar schema + parser dirigidos pelo leiaute**.
- O **pacote final `.XML` (DAT) é CRIPTOGRAFADO** (DATAPACKET Delphi, campos `CMP01..CMP05`,
  conteúdo hex cifrado). **NÃO é fonte importável.** Importa-se o **export legível que o
  contábil gera ANTES de cifrar** (a carga no leiaute).
- Versão do leiaute em uso: **2.0.0.5 (18/05/2026)**.

### Modelo do núcleo (CT — execução da despesa), confirmado no leiaute
Cadeia: `CADASTRO_GERAL` (credor) ← `EMPENHO` ← `LIQUIDACAO_EMPENHO` ← `PAGAMENTO_EMPENHO`
(N:N via `PAGAMENTO_EMPENHO_LIQUIDACAO`), ancorada em `DOTACAO`.
- **CADASTRO_GERAL**: `CG_Identificacao` (**CPF/CNPJ — PII quando pessoa física**), CG_Nome, tipo, endereço…
- **EMPENHO**: PK natural (ORG_Codigo, UNOR_Codigo, EMP_Numero `999999/AAAA`); credor = CG_Identificacao; EMP_Data, EMP_Descricao, EMP_Tipo, EMP_Valor.
- **LIQUIDACAO_EMPENHO**: PK (ORG, UNOR, EMP_Numero, LIQ_Numero); LIQ_Data, LIQ_Valor.
- **PAGAMENTO_EMPENHO**: PK PGTO_Numero; PGTO_Data, PGTO_Valor. Liga-se à liquidação pela tabela ponte.

## Decisão

### 1. Regra de ouro — números vêm de CONSULTA ESTRUTURADA, nunca de embeddings
Valores de contas públicas **não** podem ser produzidos por busca semântica (risco de
**alucinar cifras** — inaceitável legalmente). O dado fica em **tabelas estruturadas** e o
bot responde via **consulta determinística** (agregações parametrizadas), citando
**exercício + fonte**. Embeddings, se usados, indexam SÓ texto (ex.: `EMP_Descricao`) para
LOCALIZAR o registro; o número vem sempre da linha.

### 2. Pipeline de ingestão (respeita a fronteira de camadas)
```
Export APLIC legível (.zip)
  → upload via API (multipart, só admin do tenant)         [web/app NUNCA toca storage/db]
  → parser dirigido pelo leiaute CSV (valida tipos/chaves)
  → UPSERT idempotente em tabelas canônicas aplic_* (RLS por tenant)
       chave natural = (tenant_id, exercicio, <chaves do leiaute>)
  → registra a carga (origem, volume, competência, timestamp) p/ rastreabilidade
```
Jobs pesados na fila `integracoes`/`transparencia` (worker já existe). Idempotência: reprocessar a mesma competência não duplica.

### 3. Tabelas canônicas (POC — CT execução da despesa)
`aplic_credor`, `aplic_dotacao`, `aplic_empenho`, `aplic_liquidacao`,
`aplic_pagamento`, `aplic_pagamento_liquidacao` — todas com `tenant_id` + RLS, `exercicio`,
e as chaves naturais do leiaute. (Demais módulos — FP, ORÇAMENTO, Licitação, RPPS — em fases seguintes.)

### 4. Consumo (decisão do usuário: bot + páginas públicas)
- **Transparência ativa + Dados Abertos** (CSV/JSON + dicionário, CC BY 4.0): reusa o módulo
  de transparência existente; páginas de empenhos/pagamentos por órgão/credor/período.
- **IA — ferramenta de consulta**: um conjunto de **consultas parametrizadas seguras**
  (NÃO text-to-SQL livre) que o bot aciona, ex.: total pago a um credor por período,
  empenhos por órgão/função, maiores credores, situação de um empenho. O bot traduz a
  pergunta → escolhe a consulta → apresenta o resultado citando período/fonte.

### 5. LGPD (base legal: obrigação legal de transparência, LC 131; com minimização)
- `CG_Identificacao` de **pessoa física = CPF**: armazenar, mas **mascarar** (`***.456.789-**`)
  no público e na IA — padrão de transparência. CNPJ é público (não mascara).
- **Nunca** expor CPF/PII no chat nem em log. Matrículas de responsáveis (liquidação/atesto)
  não vão ao público. Acionar o DPO para o RIPD do módulo. Folha (FP) fica para fase própria,
  com tratamento de PII específico.

## Formato da carga — CONFIRMADO (amostra CM_AltoGarças, CT 2026/01)
- A carga é um **`.zip` por módulo/ano/competência** (ex.: `1113190CT202601.ZIP` =
  entidade `1113190` + módulo `CT` + ano `2026` + comp. `01`).
- Dentro: **um XML por tabela do leiaute**, nomeado igual ao `NOMETABELA`
  (`EMPENHO.XML`, `CADASTRO_GERAL.XML`, `LIQUIDACAO_EMPENHO.XML`,
  `PAGAMENTO_EMPENHO.XML`, `PAGAMENTO_EMPENHO_LIQUIDACAO.XML`, …) + PDFs anexos
  (`DD_*`, `NTFSC_*`) + `!APLIC_MODULO1.DAT` (manifesto cifrado — IGNORAR).
- Cada XML é um **DATAPACKET** (Delphi ClientDataSet), `encoding="ISO-8859-1"`:
  `<METADATA><FIELDS><FIELD attrname width fieldtype/></FIELDS></METADATA>` +
  `<ROWDATA><ROW attr="valor".../></ROWDATA>`. Campos = nomes do leiaute.
  **Decimal com ponto** (`EMP_Valor="13332.69"`), **datas `dd/mm/aaaa`**, sem separador de milhar.
- **Parser genérico único** serve a TODAS as tabelas/módulos (o DATAPACKET é autodescritivo).
- **VALIDADO em dado real** (parser + soma): EMPENHO 37 linhas = R$ 401.480,38;
  LIQUIDAÇÃO 21 = R$ 292.613,17; PAGAMENTO 17 = R$ 197.676,45. Libs: `fast-xml-parser` + `jszip`
  (já adicionadas à API); decode `latin1`.

## Consequências
- **+** Transparência com dado real (encerra Agili); bot fiscal **preciso** e auditável;
  schema/parser gerados do leiaute oficial (baixa ambiguidade); multi-tenant por RLS.
- **−/limites** O leiaute muda anualmente (versionar o parser por ano: 2026 = v2.0.0.5);
  carga inicial pode ser volumosa (lotes na fila); exige disciplina de mascaramento de PII.
- **Não-objetivo agora:** importar o pacote cifrado; folha (FP); RPPS.

## Alternativas consideradas
- **RAG/embeddings sobre os números** — rejeitado: alucina cifras (inadmissível p/ contas públicas).
- **Importar o DAT cifrado** — inviável (cifrado pela ferramenta do TCE).
- **Text-to-SQL livre para o bot** — rejeitado p/ o POC: risco de query insegura/custosa;
  preferimos consultas parametrizadas allow-list (pode evoluir depois com guarda-corpos).
