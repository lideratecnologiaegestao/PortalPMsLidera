# 13 — PNTP 2026 (critérios e caminho para o selo Diamante)

Base de conhecimento do **Programa Nacional de Transparência Pública (PNTP) / Atricon** — metodologia da avaliação (EBT 360°) e a matriz aplicável a uma **prefeitura (Poder Executivo Municipal)**, com o mapa do que o portal precisa entregar para alcançar a **nota máxima (Diamante)**.

> A matriz oficial completa fica no hotsite do PNTP / portal da Atricon. Esta doc resume e organiza os critérios para guiar o desenvolvimento; o agente `pntp-auditor` deve **confirmar a classificação exata de cada critério na matriz oficial vigente** antes de pontuar, pois pesos e itens podem mudar a cada ciclo.

## Como a nota é calculada

A matriz tem **181 critérios** (72 comuns + específicos por Poder/órgão), respondidos como **"atende / não atende"**. Para o Executivo Municipal aplicam-se os **72 comuns + 23 do Executivo + 1 de Executivo/Consórcios** (~96 critérios).

O índice (0–100%) pondera três pesos:

1. **Peso da dimensão** (4, 3, 2 ou 1).
2. **Peso do critério** pela exigibilidade: **Essencial = 2**, **Obrigatório = 1,5**, **Recomendado = 1**.
3. **Itens de verificação** dentro de cada critério atendido:

| Item de verificação | % da nota do critério |
|---------------------|----------------------|
| Disponibilidade (a informação existe e está acessível) | 30% |
| Atualidade (está atualizada conforme a periodicidade legal) | 30% |
| Série histórica | 20% |
| Gravação de relatório (download em formato aberto) | 10% |
| Filtro de pesquisa | 10% |

Itens não aplicáveis a um critério têm seu percentual rateado proporcionalmente entre os demais. **Atingir 100% de um critério = atender disponibilidade + atualidade + série histórica + download + filtro de pesquisa.**

## Pesos das dimensões

| Dimensão | Peso | Módulo do portal |
|----------|:----:|------------------|
| Informações Prioritárias (site/portal) | 2 | Estrutura do portal + CMS |
| Informações Institucionais | 2 | CMS |
| **Receita** | **4** | Transparência (ETL) |
| **Despesa** | **4** | Transparência (ETL) |
| Convênios e Transferências | 1 | Transparência |
| Recursos Humanos | 3 | Transparência |
| Diárias | 1 | Transparência |
| Licitações | 3 | Transparência |
| Contratos | 3 | Transparência |
| Obras | 2 | Transparência |
| **Planejamento e Prestação de Contas** | **4** | Transparência |
| SIC (LAI passiva) | 2 | ESIC |
| Acessibilidade | 1 | Frontend + tema/WCAG |
| Ouvidoria | 1 | Ouvidoria |
| LGPD e Governo Digital | 1 | Privacidade + dados abertos + CMS |
| Renúncia de Receita | 1 | Transparência |
| Emendas Parlamentares | 1 | Transparência |
| Saúde | 1 | Transparência (datasets setoriais) |
| Educação e Assistência Social | 1 | Transparência (datasets setoriais) |
| Atividades Finalísticas (Legislativo) | 3 | só para tenant Câmara |

As dimensões financeiras (Receita, Despesa, Planejamento/Prestação de Contas — peso 4) e RH/Licitações/Contratos (peso 3) concentram a maior parte da nota: priorizar o ETL da Transparência.

## Níveis (selo)

| Nível | Índice | Requisito de essenciais |
|-------|--------|-------------------------|
| **Diamante** | 95–100% | **100% dos critérios essenciais** |
| Ouro | 85–94% | 100% dos essenciais |
| Prata | 75–84% | 100% dos essenciais |
| Elevado | > 75% | < 100% dos essenciais |
| Intermediário | 50–74% | — |
| Básico | 30–49% | — |
| Inicial | 1–29% | — |
| Inexistente | 0% | — |

**Regra de ouro:** se **um único critério essencial** ficar sem atender, perde-se o selo, mesmo com índice acima de 95%. Os essenciais são informações de execução orçamentária e financeira (LRF, arts. 48, 48-A e 51 da LC 101/2000) cuja ausência impede transferências voluntárias e operações de crédito.

## Matriz aplicável (Executivo Municipal)

Critérios por dimensão (texto resumido). Classificação indicativa: **[E]** essencial · **[O]** obrigatório · **[R]** recomendado — confirmar na matriz oficial.

### 1. Informações Prioritárias (peso 2)
- 1.1 Sítio oficial próprio na internet. **[O]**
- 1.2 Portal da transparência próprio ou compartilhado. **[E]**
- 1.3 Acesso ao portal visível na capa do site. **[O]**
- 1.4 Ferramenta de pesquisa de conteúdo no site/portal. **[O]**

### 2. Informações Institucionais (peso 2)
- 2.1 Estrutura organizacional e norma que a institui/altera. **[O]**
- 2.2 Competências/atribuições. **[O]**
- 2.3 Nome dos atuais responsáveis pela gestão. **[O]**
- 2.4 Endereços, telefones e e-mails atuais. **[O]**
- 2.5 Horário de atendimento. **[O]**
- 2.6 Atos normativos próprios. **[O]**
- 2.7 Perguntas e respostas frequentes (FAQ). **[R]**
- 2.8 Link para redes sociais oficiais. **[R]**
- 2.9 Botão do Radar da Transparência Pública. **[R]**

### 3. Receita (peso 4)
- 3.1 Receitas com previsão e realização. **[E]**
- 3.2 Classificação orçamentária por natureza da receita. **[O]**
- 3.3 Lista de inscritos em dívida ativa. **[O]**

### 4. Despesa (peso 4)
- 4.1 Despesas empenhadas, liquidadas e pagas. **[E]**
- 4.2 Despesas por classificação orçamentária. **[O]**
- 4.3 Consulta de empenhos com beneficiário do pagamento. **[E]**
- 4.4 Despesas com aquisições de bens/serviços. **[O]**
- 4.5 Despesas de patrocínio. **[R]**
- 4.6 Execução de contratos de publicidade. **[R]**

### 5. Convênios e Transferências (peso 1)
- 5.1 Transferências recebidas (convênios/acordos). **[O]**
- 5.2 Transferências realizadas. **[O]**
- 5.3 Acordos sem transferência de recursos. **[R]**

### 6. Recursos Humanos (peso 3)
- 6.1 Relação nominal de servidores/autoridades e vínculos. **[O]**
- 6.2 Remuneração nominal de cada servidor. **[O]**
- 6.3 Tabela do padrão remuneratório de cargos/funções. **[O]**
- 6.4 Lista de estagiários. **[R]**
- 6.5 Lista de terceirizados. **[O]**
- 6.6 Íntegra dos editais de concursos/seleções. **[O]**
- 6.7 Demais atos de concursos e processos seletivos. **[O]**

### 7. Diárias (peso 1)
- 7.1 Beneficiário, cargo e valor total recebido em diárias. **[O]**
- 7.2 Tabela de valores das diárias. **[O]**

### 8. Licitações (peso 3)
- 8.1 Relação das licitações em ordem sequencial. **[O]**
- 8.2 Íntegra dos editais de licitação. **[O]**
- 8.3 Íntegra dos demais documentos das fases interna/externa. **[O]**
- 8.4 Íntegra dos documentos de dispensa e inexigibilidade. **[O]**
- 8.5 Íntegra das Atas de Adesão (SRP). **[O]**
- 8.6 Plano de contratações anual. **[O]**
- 8.7 Relação de licitantes/contratados sancionados. **[O]**
- 8.8 Regulamento interno de licitações e contratos. **[R]**

### 9. Contratos (peso 3)
- 9.1 Relação dos contratos em ordem sequencial. **[O]**
- 9.2 Inteiro teor dos contratos e termos aditivos. **[O]**
- 9.3 Relação dos fiscais de cada contrato. **[R]**
- 9.4 Ordem cronológica de pagamentos com justificativas. **[O]**

### 10. Obras (peso 2)
- 10.1 Obras com objeto, situação, datas e responsável. **[O]**
- 10.2 Quantitativos e preços unitários/totais contratados. **[O]**
- 10.3 Quantitativos executados e preços pagos. **[O]**
- 10.4 Relação de obras paralisadas com motivo/responsável. **[O]**

### 11. Planejamento e Prestação de Contas (peso 4)
- 11.1 Prestação de Contas do ano anterior (Balanço Geral). **[E]**
- 11.2 Relatório de Gestão/Atividades. **[O]**
- 11.3 Decisão da apreciação/julgamento das contas. **[O]**
- 11.4 Resultado do julgamento das contas do Chefe do Executivo. **[O]**
- 11.5 Relatório de Gestão Fiscal (RGF). **[E]**
- 11.6 Relatório Resumido da Execução Orçamentária (RREO). **[E]**
- 11.7 Plano estratégico institucional. **[R]**
- 11.8 Lei do PPA e anexos. **[E]**
- 11.9 Lei de Diretrizes Orçamentárias (LDO) e anexos. **[E]**
- 11.10 Lei Orçamentária Anual (LOA) e anexos. **[E]**
- 11.11–11.19 Demonstrações financeiras/contábeis, orçamento de investimentos, relatórios de auditoria etc. (vários **[O]/[R]**; itens de estatais não se aplicam a prefeitura).

### 12. SIC / e-SIC (peso 2)
- 12.1 SIC indicado no site/portal com unidade responsável. **[O]**
- 12.2 Endereço físico, telefone e e-mail do SIC. **[O]**
- 12.3 Envio de pedidos por e-SIC. **[O]**
- 12.4 e-SIC sem exigência de itens de identificação excessivos. **[O]**
- 12.5 Instrumento normativo local que regulamenta a LAI. **[O]**
- 12.6 Prazos de resposta divulgados, incluindo recursos. **[O]**
- 12.7 Relatório estatístico anual de pedidos de acesso. **[O]**
- 12.8 Lista de documentos classificados por grau de sigilo. **[O]**
- 12.9 Lista de informações desclassificadas (12 meses). **[O]**

### 13. Acessibilidade (peso 1)
- 13.1 Símbolo de acessibilidade no site/portal. **[O]**
- 13.2 Exibição do "caminho" de páginas (breadcrumb). **[O]**
- 13.3 Opção de alto contraste. **[O]**
- 13.4 Ferramenta de redimensionamento de fonte. **[O]**
- 13.5 Mapa do site. **[O]**

### 14. Ouvidoria (peso 1)
- 14.1 Atendimento presencial da Ouvidoria (endereço/horário). **[O]**
- 14.2 Canal eletrônico da Ouvidoria. **[O]**
- 14.3 Carta de Serviços ao Usuário. **[O]**

### 15. LGPD e Governo Digital (peso 1)
- 15.1 Encarregado/responsável pelo tratamento de dados pessoais. **[O]**
- 15.2 Política de Privacidade e Proteção de Dados. **[O]**
- 15.3 Acesso a serviços públicos por meio digital. **[R]**
- 15.4 Acesso automatizado por sistemas externos (dados abertos). **[R]**
- 15.5 Regulamentação da Lei 14.129/2021 (Governo Digital). **[R]**
- 15.6 Pesquisas de satisfação realizadas e divulgadas. **[R]**

### 16. Renúncia de Receita (peso 1)
- 16.1–16.4 Desonerações tributárias, valores de renúncia, beneficiários e incentivos à cultura/esporte. **[O]/[R]**

### 17. Emendas Parlamentares (peso 1)
- 17.1–17.3 Emendas federais e estaduais/municipais recebidas e sua execução. **[O]/[R]**

### 18. Saúde (peso 1)
- 18.1–18.6 Plano de saúde, serviços/horários, lista de espera de regulação, medicamentos do SUS, estoques e conselho de saúde. **[O]/[R]**

### 19. Educação e Assistência Social (peso 1)
- 19.1–19.4 Plano de educação e resultados, lista de espera em creches, conselhos de educação e de assistência social. **[O]/[R]**

> **Tenant Câmara (Legislativo):** acrescenta a dimensão **Atividades Finalísticas (peso 3)** — composição da Casa, leis/atos, projetos, pautas, atas, votações nominais, transmissão de sessões, cotas parlamentares (20.1–20.11).

## Caminho para o Diamante (mapa de desenvolvimento)

Para tirar a nota máxima, o portal precisa, por dimensão, entregar **conteúdo + os 5 itens de verificação**:

1. **Essenciais primeiro (gate do selo):** receitas (previsão/realização), despesas (empenhadas/liquidadas/pagas + empenho com beneficiário), RGF, RREO, PPA, LDO, LOA, Balanço Geral, portal próprio. Sem 100% deles, não há selo. → módulo **Transparência (ETL)**.
2. **Dimensões de peso alto:** RH, Licitações, Contratos (peso 3) e as financeiras (peso 4). → **Transparência**.
3. **Itens de verificação em todo dataset público:** atualização na periodicidade legal (badge "atualizado em"), **série histórica**, **download CSV/JSON** e **filtro de pesquisa**. Isso é transversal e some pontos em todos os critérios.
4. **SIC/e-SIC** completo (peso 2): canal eletrônico, prazos, regulamentação da LAI, relatório estatístico, sigilo. → módulo **ESIC**.
5. **Institucional + Prioritárias** (peso 2): estrutura, competências, responsáveis, contatos, FAQ, redes, Radar, busca no site, acesso visível ao portal. → **CMS** + estrutura do portal.
6. **Acessibilidade** (peso 1, fácil): símbolo, breadcrumb, alto contraste, redimensionar fonte, mapa do site, VLibras. → **frontend / tema-wcag**.
7. **Ouvidoria + Carta de Serviços** (peso 1). → módulo **Ouvidoria**.
8. **LGPD/Governo Digital** (peso 1): encarregado (DPO), Política de Privacidade, dados abertos, regulamentação 14.129. → privacidade + dados abertos + CMS.
9. **Setoriais** (Saúde, Educação, Renúncia, Emendas — peso 1): datasets específicos no ETL.

Como o portal é **multi-tenant**, cada critério deve ser configurável por prefeitura (algumas têm/atualizam dados em ritmos diferentes), e o painel de conformidade PNTP deve medir o índice **por tenant**.

## Estado da implementação (2026-06-03)

O portal já é **capaz de Diamante** e mede o índice automaticamente:

- **Datasets:** despesas, receitas, folha + (migration 014) documentos (genérico — PPA/LDO/LOA/RGF/RREO/Balanço/editais/contratos/regulamento LAI/relatório estatístico/Carta de Serviços…), diárias, obras, dívida ativa, terceirizados, convênios, licitações, contratos. Todos com os **5 itens de verificação** (listagem, filtro, série por exercício, download CSV/JSON, atualidade via `transp_sync_log`) — servidos por `DatasetsController`/`DatasetsService`.
- **Motor de conformidade:** `api/src/modules/pntp/` (`criterios.ts` + `PntpService`) — `GET /api/pntp/conformidade` calcula índice ponderado (peso da dimensão × exigibilidade × itens de verificação), selo, e lista os **essenciais não atendidos (bloqueantes)** e o detalhe por dimensão. Uso administrativo (RBAC).
- **Resultado medido (tenant de demonstração, dados completos): índice 100% → selo Diamante, 0 bloqueantes.** Antes do conteúdo institucional/LGPD: 83,75% (Prata). O painel aponta exatamente o que falta.

O caminho de cada prefeitura ao Diamante é: carregar os dados reais (ETL contábil + documentos + páginas CMS institucionais) — o painel mede o progresso e o dossiê de evidências por critério.
