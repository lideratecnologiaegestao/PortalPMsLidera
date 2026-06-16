# Classificação dos Documentos por Cadastro (base TCE-MT)

Mapa de cada item para o **cadastro exclusivo** correto e a **taxonomia oficial do TCE-MT** que alimenta seus "tipos". Os seeds estão em `seeds/*.json`.

## Cadastros e a taxonomia (seed) de cada um

| Cadastro exclusivo | "Tipos" vêm de (seed TCE-MT) | Observação |
|--------------------|------------------------------|------------|
| **Leis** | `natureza_lei.json` (83 naturezas) | Orgânica, Criação, PPA, LDO, LOA, PCCS, Estatuto dos Servidores, Plano Diretor… |
| **Decretos** | *(definir pelo município)* | TCE não fornece tabela; tipos sugeridos: Decreto numerado, Decreto legislativo, Decreto de nomeação/exoneração, regulamentar |
| **Portarias e Resoluções** | *(definir pelo município)* | Tipos sugeridos: Portaria, Resolução, Instrução Normativa, Ordem de Serviço, Circular |
| **Licitações / Processos Licitatórios** | `modalidade_licitacao.json` (70) + `criterio_julgamento_licitacao.json` (12) | Modalidade (Pregão, Concorrência, Dispensa, Inexigibilidade, Credenciamento, Adesão a RP…) + critério (Menor preço, Técnica e preço…). Flags Lei 8.666 / 14.133 já vêm no seed |
| **Concursos e Processos Seletivos** | `tipo_concurso.json` (6) + `concurso_tipo_documento.json` (40) | Tipo do certame + documentos por **fase/situação** (Abertura, Homologação, etc.) |
| **Conselhos Municipais** | `tipo_conselho_municipal.json` (41) + `tipo_membro_conselho.json` (3) | Tipo do conselho (Saúde, Educação, Tutelar…) + papel do membro (Designado, Representante, Presidente) |
| **Alvarás** | *(definir pelo município)* | Tipos sugeridos: Construção, Funcionamento, Sanitário, Ambiental, Localização |
| **Documentos (genérico)** | tipos configuráveis (cada um com **slug** + menu automático) | Para tudo que não tem cadastro próprio; pode usar `tipo_documento_diverso.json` como referência |

> **Contas Públicas / Prestação de Contas** (RGF, RREO, Balanços, PPA/LDO/LOA executados) **não** entram no cadastro genérico de documentos — vivem no módulo de **Transparência financeira** (vêm do ETL contábil) e são itens **essenciais** do PNTP.

## Classificação dos 24 itens enviados

| # | Item | Cadastro | Tipo / taxonomia (TCE-MT) | Observação |
|---|------|----------|----------------------------|------------|
| 1 | Alvarás | **Alvarás** | tipo de alvará (município) | cadastro próprio |
| 2 | Ata de Conselhos Municipais | **Conselhos Municipais** | documento "Ata" do conselho (`tipo_conselho_municipal`) | a ata fica dentro do conselho |
| 3 | Atas de Registro de Preço | **Licitações** | documento da licitação/SRP (`modalidade_licitacao`: Adesão a RP / Pregão) | artefato de licitação |
| 4 | Audiência Pública | **Documentos** | tipo "Audiência Pública" (slug `audiencias-publicas`) | pode vincular a LDO/LOA/Saúde |
| 5 | Concursos | **Concursos e Processos Seletivos** | `tipo_concurso` = Concurso Público | docs via `concurso_tipo_documento` |
| 6 | Conselhos Municipais | **Conselhos Municipais** | `tipo_conselho_municipal` + `tipo_membro_conselho` | — |
| 7 | Contratos e Aditivos | **Contratos** *(recomendado criar)* | vinculado à licitação de origem | dimensão própria do PNTP (peso 3); não estava na sua lista |
| 8 | Convênios | **Convênios/Transferências** *(recomendado)* ou Documentos | `natureza_lei` "Convênios" (quando a lei autoriza) | dimensão própria do PNTP |
| 9 | Decretos | **Decretos** | tipo de decreto (município) | — |
| 10 | Editais de Convocação | depende | Concursos (convocação de aprovados) · Conselhos (reunião) · senão **Documentos** (tipo "Edital de Convocação") | classificar pela origem |
| 11 | Escala de Plantões Médicos | **Documentos / Saúde** | tipo "Escala de Plantões Médicos" | item de transparência da Saúde |
| 12 | Estatutos | **Leis** (se instituído por lei) · senão **Documentos** | `natureza_lei` "Estatuto dos servidores Públicos" (25/41) | Estatuto do Servidor é lei |
| 13 | ITR – Imposto Territorial Rural | **Documentos / Tributário** | tipo "ITR" | convênio RFB; transparência tributária |
| 14 | Leis | **Leis** | `natureza_lei` | — |
| 15 | Licitações | **Licitações** | `modalidade_licitacao` + `criterio_julgamento_licitacao` | — |
| 16 | Lista de Espera em Creches | **Documentos / Educação** | tipo "Lista de Espera em Creches" | item PNTP Educação |
| 17 | Plano de Saneamento Básico | **Documentos / Planos** | tipo "Plano de Saneamento Básico" | ou cadastro "Planos Municipais" |
| 18 | Plano Municipal | **Documentos / Planos** | tipo "Plano Municipal" (educação/saúde/mobilidade…) | Plano Diretor é `natureza_lei` 34 quando por lei |
| 19 | Portarias | **Portarias e Resoluções** | tipo "Portaria" | — |
| 20 | Processo Seletivo | **Concursos e Processos Seletivos** | `tipo_concurso` = Proc. Seletivo Simplificado/Público | docs via `concurso_tipo_documento` |
| 21 | Remume | **Documentos / Saúde** | tipo "REMUME — Relação Municipal de Medicamentos" | item de transparência da Saúde |
| 22 | Requerimento | **Documentos** | tipo "Requerimento" | — |
| 23 | RGF – Relatório de Gestão Fiscal | **Contas Públicas / Prestação de Contas** | financeiro (LRF) | **essencial PNTP**; módulo de Transparência financeira |
| 24 | RREO – Relatório Resumido da Execução Orçamentária | **Contas Públicas / Prestação de Contas** | financeiro (LRF) | **essencial PNTP**; módulo de Transparência financeira |

## Resumo

- **Cadastros próprios** (com taxonomia TCE-MT): Leis, Decretos, Portarias/Resoluções, Licitações, Concursos/Seletivos, Conselhos Municipais, Alvarás.
- **Recomendados adicionar** (aparecem na sua lista e são dimensões próprias do PNTP): **Contratos e Aditivos** e **Convênios/Transferências**.
- **Documentos (genérico)** com tipos por área (Saúde, Educação, Tributário, Planos), cada tipo com **slug** e **entrada de menu automática**: Audiência Pública, Escala de Plantões, Lista de Espera em Creches, REMUME, Planos, ITR, Requerimento, Estatutos (quando não forem lei), Editais de Convocação.
- **Fora do cadastro de documentos**: RGF e RREO (Transparência financeira / Contas Públicas).
