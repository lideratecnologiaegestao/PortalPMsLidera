# 07 — Relatório de Impacto à Proteção de Dados Pessoais (RIPD/DPIA)

**Versão:** 1.0  
**Data:** 2026-06-02  
**Elaborado por:** Encarregado de Dados (DPO) — subagent `lgpd-gdpr-dpo`  
**Revisão prevista:** a cada mudança relevante no tratamento ou anualmente (o que vier primeiro)  
**Referência normativa:** LGPD art. 5º, XVII; Guia Orientativo de DPIA — ANPD (2022)

---

## Apresentação e escopo deste documento

Este RIPD cobre dois tratamentos de dados pessoais identificados como de **alto risco** na plataforma SaaS multi-tenant Portal de Prefeitura, nos termos do art. 5º, XVII da LGPD e da orientação da ANPD sobre operações que envolvem tratamento em larga escala, dados de localização e publicação individualizada de dados financeiros de servidores.

Os dois tratamentos analisados são:

1. **Publicação da Folha de Pagamento** — módulo Transparência (`/api/transparencia/folha`).
2. **Denúncias Georreferenciadas do App do Cidadão** — módulo Chamados (tabelas `chamados`, `chamado_fotos`, `chamado_atualizacoes`).

Para cada tratamento, este documento segue a estrutura do modelo ANPD: identificação, necessidade/proporcionalidade, natureza/escopo/contexto/finalidade, dados e titulares, ciclo de vida, avaliação de riscos, medidas de mitigação e conclusão. Ao final, há um checklist técnico direcionado ao desenvolvedor do módulo Chamados.

---

## Parte I — Folha de Pagamento (Módulo Transparência)

### 1. Identificação do Tratamento

| Campo | Valor |
|-------|-------|
| Nome do tratamento | Publicação individualizada da folha de pagamento de servidores públicos municipais |
| Módulo | Transparência (`transp_folha`) |
| Endpoint principal | `GET /api/transparencia/folha` (sem autenticação; acesso público) |
| Data de início | A definir por tenant (go-live do módulo Transparência) |
| Controlador | A Prefeitura Municipal contratante (tenant). Cada prefeitura é controladora independente dos dados de seus servidores. |
| Operador | Empresa operadora da plataforma SaaS (quem desenvolve e hospeda o sistema). |
| Encarregado (DPO) | A ser nomeado por cada prefeitura nos termos do art. 41 da LGPD. A plataforma oferece suporte ao DPO do tenant. |
| Subprocessadores | Provedor de infraestrutura (Docker/Kubernetes no servidor Lidera); CDN/Cloudflare (em trânsito). Não há repasse de dados de folha a terceiros. |

**Papel dos atores:** A arquitetura SaaS multi-tenant implica que a prefeitura (controladora) define a finalidade e os meios essenciais do tratamento (publicar a folha por obrigação legal). A plataforma (operadora) executa o tratamento em nome da controladora, com obrigações contratuais de conformidade (DPA — Data Processing Agreement) a ser celebrado entre as partes por exigência do art. 39 da LGPD.

---

### 2. Necessidade e Proporcionalidade

**Necessidade:** A publicação da folha de pagamento é **obrigação legal expressa** imposta pela Lei Complementar 131/2009 (art. 2º, alínea "b") e pela Lei de Responsabilidade Fiscal (LC 101/2000), que exigem a publicização das despesas com pessoal em sítio eletrônico de acesso público. O tratamento não é facultativo para o controlador público.

**Proporcionalidade:** O Supremo Tribunal Federal, no ARE 652.777 (Tema 484, rel. Min. Teori Zavascki, 2015), fixou a constitucionalidade da publicação do nome, vínculo e remuneração de servidores públicos, reconhecendo a prevalência do princípio da publicidade (CF art. 37) sobre a privacidade individual no contexto do erário. A LGPD, em seus arts. 23 a 26, não revoga este dever — ao contrário, reconhece que o tratamento pelo Poder Público se sujeita à legislação específica (art. 23, §1º), que no caso da folha é a LC 131/2009.

**Campos minimizados:** A decisão de minimização está documentada em `docs/06-lgpd-gdpr.md`. CPF não é publicado (sem amparo na LC 131); matrícula é mascarada (4 últimos dígitos); campos técnicos internos (`id`, `tenant_id`, `fonte_origem`, `atualizado_em`) não são expostos. Apenas os dados cujo fundamento de publicação é expresso em lei ou jurisprudência do STF são retornados pela API pública.

---

### 3. Natureza, Escopo, Contexto e Finalidades

**Finalidade:** Transparência ativa das despesas de pessoal do Poder Público municipal; controle social sobre o erário; cumprimento de obrigação imposta pela LC 131/2009.

**Natureza do dado:** Dados pessoais de categoria comum (nome, cargo, vínculo, órgão, valores de remuneração). Não há dados de categorias especiais (art. 11 da LGPD) na publicação — descontos não identificam condições de saúde ou sindicato de forma diretamente atribuível na estrutura atual.

**Escopo:** Todos os servidores ativos do município controlador, em cada competência mensal publicada. O escopo temporal abrange o histórico disponível para consulta (dado de acervo público contínuo).

**Contexto:** Dados provenientes do sistema contábil do tenant, ingeridos via ETL (n8n) e normalizados na tabela `transp_folha`. A publicação é passiva (o cidadão consulta) e não envolve profilagem ou decisão automatizada sobre os titulares.

**Base legal LGPD:** Art. 7º, II (cumprimento de obrigação legal ou regulatória) e art. 23 (tratamento pelo Poder Público). Finalidade declarada e prevista em lei.

**Base legal GDPR (para servidores titulares na UE, improvável mas coberto):** Art. 6.1(c) — cumprimento de obrigação legal.

---

### 4. Dados Pessoais Tratados e Categorias de Titulares

| Dado | Natureza | Publicado? | Decisão |
|------|----------|------------|---------|
| `nome_servidor` | Dado pessoal comum | Sim | STF ARE 652.777; LC 131 |
| `cargo` | Dado pessoal comum | Sim | LC 131 — necessário para contextualizar despesa |
| `vinculo` | Dado pessoal comum | Sim | LC 131 — efetivo/comissionado é informação pública |
| `orgao` | Dado pessoal comum | Sim | LC 131 — órgão pagador necessário para controle |
| `remuneracao_bruta` | Dado pessoal financeiro | Sim | STF ARE 652.777 — "vencimentos e vantagens" |
| `descontos` | Dado pessoal financeiro | Sim | Necessário para transparência do custo-total |
| `remuneracao_liquida` | Dado pessoal financeiro | Sim | STF ARE 652.777 |
| `exercicio` / `mes` | Referência temporal | Sim | Período da despesa — necessário para controle |
| `matricula_mascarada` | Identificador interno (parcial) | Parcialmente | Últimos 4 chars; sem amparo legal para publicação integral |
| `matricula` (completa) | Identificador interno | Não | Não previsto na LC 131; risco de cruzamento com outros sistemas |
| CPF | Dado pessoal sensível à fraude | Não | Sem amparo na LC 131; violaria minimização (LGPD art. 6º, III) |
| `id`, `tenant_id`, metadados internos | Técnico | Não | Sem interesse público; risco de exposição de arquitetura |

**Categorias de titulares:** Servidores públicos municipais (efetivos, comissionados, temporários, estatutários e celetistas) do tenant. Não há titulares menores de idade ou em situação de vulnerabilidade especial na categoria padrão, ressalvados casos específicos (ver item de risco R-04 abaixo).

**Volume estimado:** Variável por tenant (de centenas a dezenas de milhares de servidores por competência).

---

### 5. Ciclo de Vida dos Dados

| Fase | Descrição |
|------|-----------|
| **Coleta** | ETL via n8n a partir do sistema contábil do tenant. Frequência: mensal por competência. Idempotência por chave natural (exercício + mês + matrícula). |
| **Armazenamento** | Tabela `transp_folha` no PostgreSQL, isolada por `tenant_id` e protegida por RLS. Dados em repouso cifrados pelo storage do sistema operacional (volume criptografado). |
| **Processamento interno** | Consulta interna (RBAC: `gestor`, `admin_prefeitura`) acessa matrícula completa para fins de gestão. Consulta pública recebe projeção minimizada (mascaramento na camada de serviço). |
| **Publicação** | `GET /api/transparencia/folha` retorna apenas os campos aprovados; o mascaramento de matrícula e a projeção de campos ocorrem na camada de serviço (`TransparenciaService`), nunca no frontend. |
| **Retenção** | Permanente enquanto dado de acervo público (obrigação contínua de transparência). A LC 131 não estabelece prazo de eliminação — o dado é parte do registro histórico das finanças públicas municipais. |
| **Eliminação/Anonimização** | Não há eliminação prevista por finalidade legal. Casos excepcionais (decisão judicial de supressão de nome) são tratados pelo campo `nome_suprimido boolean` (ver item de risco R-03), que substitui o nome por "NOME SUPRIMIDO — MEDIDA PROTETIVA" sem alterar os valores financeiros. |
| **Exportação** | CSV e JSON disponíveis para download (dados abertos); os mesmos campos minimizados da API aplicam-se às exportações. |

---

### 6. Avaliação de Riscos — Folha de Pagamento

A probabilidade e o impacto são graduados em: **Baixa (B)**, **Média (M)** e **Alta (A)**.

| ID | Risco ao Titular | Probabilidade | Impacto | Nível |
|----|-----------------|--------------|---------|-------|
| R-01 | Uso indevido da remuneração publicada para fins de discriminação, assédio ou constrangimento pessoal | M | A | **Alto** |
| R-02 | Cruzamento de dados com outras fontes (redes sociais, cartório, Receita) para perfilamento do servidor | A | M | **Alto** |
| R-03 | Exposição do nome de servidor em situação de proteção especial (vítima de violência doméstica, proteção de testemunha, perseguição) | B | A | **Médio** |
| R-04 | Vazamento do banco interno com matrícula completa, CPF e dados não mascarados (ex.: dump por acesso privilegiado indevido) | B | A | **Médio** |
| R-05 | Raspagem (scraping) automatizada dos dados publicados para fins comerciais ou de perfilamento em massa | A | M | **Alto** |
| R-06 | Associação equivocada de servidor homônimo com outra pessoa | M | M | **Médio** |
| R-07 | Exposição de dado de desconto identificando condição específica (ex.: desconto de plano de saúde revela crença/condição) | B | M | **Baixo** |

---

### 7. Medidas de Mitigação — Folha de Pagamento

#### Medidas já implementadas (ou previstas na arquitetura)

| Medida | Descrição | Status |
|--------|-----------|--------|
| Minimização de campos | CPF não publicado; matrícula mascarada; metadados internos suprimidos | Implementado (spec/06-lgpd-gdpr) |
| Mascaramento na camada de serviço | Lógica no backend (`TransparenciaService`); nunca no frontend | Previsto na spec |
| RLS por tenant | Acesso interno ao banco restrito ao tenant correto; cruzamento cross-tenant bloqueado | Implementado (005_app_cidadao_postgis.sql usa `app_enable_tenant_rls`) |
| Criptografia em trânsito | HTTPS obrigatório (Cloudflare + Nginx); dado nunca trafega em claro | Implementado (infra) |
| Criptografia em repouso | Volume de storage criptografado no servidor | Recomendado (implementar na infra) |
| `audit_log` para acesso interno | Ações de gestor/admin que consultam matrícula completa registradas | A implementar no serviço |
| RBAC no acesso interno | Matrícula completa acessível apenas a roles internas (`gestor`, `admin_prefeitura`) | A implementar |

#### Medidas adicionais recomendadas (a implementar)

| Medida | Risco mitigado | Prioridade |
|--------|---------------|------------|
| **Campo `nome_suprimido boolean`** na tabela `transp_folha` (via migration futura) | R-03 | Alta |
| **Rate limiting** no endpoint público `/api/transparencia/folha` (ex.: 60 req/min por IP) para dificultar scraping em massa | R-05 | Alta |
| **CAPTCHA/desafio** opcional em exportações volumosas (CSV/JSON completo) | R-05 | Média |
| **Aviso de privacidade** embutido na página de transparência, informando finalidade e base legal ao cidadão-consulente | Transparência (LGPD art. 9º) | Alta |
| **Processo formal** (operacional) para o DPO do tenant receber e processar pedido de supressão de nome por medida judicial | R-03 | Alta |
| **DPA (Data Processing Agreement)** entre a plataforma SaaS e cada prefeitura, formalizando papéis controlador/operador (art. 39 LGPD) | Conformidade geral | Alta |
| **Log de acesso a dado pessoal** para consultas internas à `transp_folha` com dados completos | R-04 | Média |

---

### 8. Riscos Residuais e Conclusão — Folha de Pagamento

**Risco residual principal:** O risco R-01 (uso discriminatório da remuneração publicada) e R-02 (cruzamento com outras fontes) são **inerentes ao regime de transparência obrigatória** e não podem ser eliminados sem suprimir a publicação — o que seria ilegal. Esses riscos estão dentro do espectro tolerado pelo legislador ao editar a LC 131/2009 e pelo STF ao fixar o Tema 484. A plataforma não pode e não deve tentar eliminá-los unilateralmente.

O risco R-05 (scraping) é parcialmente mitigável por rate limiting, mas dados públicos são, por definição, acessíveis. A medida visa dificultar abuso automatizado, não eliminar o acesso legítimo.

**Conclusão: FAVORÁVEL CONDICIONADO**

O tratamento é legítimo, proporcionado e amparado em obrigação legal. A liberação para produção está condicionada à implementação de:
1. Campo `nome_suprimido` e processo operacional de supressão (risco R-03).
2. Rate limiting no endpoint público (risco R-05).
3. Aviso de privacidade na página de transparência (LGPD art. 9º).
4. Celebração do DPA entre plataforma e prefeituras (LGPD art. 39).

---

## Parte II — Denúncias Georreferenciadas (App do Cidadão — Módulo Chamados)

### 1. Identificação do Tratamento

| Campo | Valor |
|-------|-------|
| Nome do tratamento | Registro, processamento e gestão de chamados urbanos com dados de geolocalização e imagem fotográfica |
| Módulo | App do Cidadão / Chamados |
| Tabelas | `chamados`, `chamado_fotos`, `chamado_atualizacoes` (`db/005_app_cidadao_postgis.sql`) |
| Endpoints | `POST /api/chamados`, `GET /api/chamados/proximos`, `GET /api/chamados/:protocolo`, `POST /api/chamados/:id/atualizacoes` |
| Data de início | A definir (módulo em implementação) |
| Controlador | Prefeitura Municipal contratante (tenant). |
| Operador | Empresa operadora da plataforma SaaS. |
| Encarregado (DPO) | A nomear por cada prefeitura (art. 41 LGPD). |
| Subprocessadores | Provedor de object storage (MinIO); serviço de push (Expo Notifications); API Anthropic (triagem opcional por IA — ver Parte II, item 7); CDN/Cloudflare. |

**Papel dos atores:** Idem ao Tratamento I — prefeitura como controladora, plataforma como operadora. A geolocalização e as fotos são coletadas diretamente do cidadão-titular pelo app móvel (Expo) e transmitidas exclusivamente à API do backend, que as processa e armazena. O app nunca acessa o banco ou o storage diretamente (CLAUDE.md, Regra 2b).

---

### 2. Necessidade e Proporcionalidade

**Necessidade:** O serviço de chamados urbanos é uma política pública de gestão do território municipal. A geolocalização é necessária para que a equipe de campo encontre e resolva o problema reportado. A foto é necessária para comprovação da ocorrência e priorização pelo gestor. Sem esses dados, o serviço perde sua utilidade prática.

**Proporcionalidade:** Deve-se usar **o mínimo necessário**: ponto geográfico preciso (latitude/longitude) no momento do chamado, não rastreamento contínuo; foto do problema, não da identidade do denunciante. A identificação do cidadão deve ser opcional conforme política do tenant.

**Anonimato como regra:** O CLAUDE.md (Regra 5) e o `docs/06-lgpd-gdpr.md` estabelecem que denúncias podem ser anônimas. Nenhum mecanismo deve impedir a abertura de chamado sem identificação prévia. Quando o cidadão não está logado, o campo `cidadao_id` permanece nulo.

---

### 3. Natureza, Escopo, Contexto e Finalidades

**Finalidade:** Gestão de ocorrências urbanas (buracos, terrenos/animais abandonados, iluminação pública, coleta de lixo, arborização, sinalização) pelo Poder Público municipal; atendimento à demanda do cidadão; controle e priorização de serviços públicos.

**Natureza dos dados:**
- **Geolocalização (latitude/longitude):** dado pessoal quando vinculado a um usuário identificado ou identificável. Revela padrões de deslocamento, endereço de residência/trabalho, rotina. A ANPD e o GDPR (Recital 51) reconhecem dados de localização como de risco elevado.
- **Fotografia:** dado pessoal (imagem do denunciante) quando o rosto do cidadão aparece; pode conter inadvertidamente imagens de terceiros, placas de veículos (dados de mobilidade), fachadas de residências.
- **Identificação via gov.br:** nome, CPF (hash), e-mail, nível de confiabilidade — vinculados ao chamado quando o cidadão está autenticado.
- **Descrição textual:** pode conter dados pessoais inadvertidos (menção de nomes, endereços de terceiros).

**Escopo:** Cidadãos que utilizam o app do município (tenant). A consulta de chamados próximos (`GET /api/chamados/proximos`) pode ser acessada sem login, mas apenas os metadados do chamado (categoria, status, endereço aproximado) são retornados — não os dados do denunciante.

**Contexto:** App móvel (Expo); coleta pontual no momento do registro; não há rastreamento contínuo de localização. O risco é a **localização precisa registrada no banco**, não o rastreamento em tempo real.

**Base legal LGPD:** Art. 7º, III (execução de política pública — gestão territorial urbana) e art. 23 (tratamento pelo Poder Público). Para o caso de cidadão que opta por criar conta e associar seu histórico: art. 7º, I (consentimento), mas o consentimento não é exigível para a abertura do chamado anônimo.

**Base legal GDPR:** Art. 6.1(e) — tarefa realizada no exercício de função pública / interesse público.

---

### 4. Dados Pessoais Tratados e Categorias de Titulares

#### Tabela `chamados`

| Campo | Tipo de dado | Pessoal? | Observação |
|-------|-------------|----------|------------|
| `id` (uuid) | Técnico | Indiretamente | Referencia o chamado; não expor ao público |
| `protocolo` | Identificador público | Indiretamente | Expor apenas ao titular ou por consulta direta |
| `cidadao_id` | FK para `users` | Sim | Nulo para chamados anônimos; vincula identidade gov.br |
| `categoria` | Operacional | Não | Tipo de ocorrência |
| `status` | Operacional | Não | Estado do chamado |
| `descricao` | Textual livre | Potencialmente | Pode conter PII inadvertida (nomes, endereços de terceiros) |
| `geo` (geography Point) | Localização exata | **Sim — alto risco** | Coordenadas precisas; revela endereço, rotina |
| `endereco` | Endereço textual | Sim | Logradouro aproximado gerado por geocodificação reversa |
| `bairro` | Geográfico agregado | Baixo risco | Granularidade aceitável para mapa público |
| `criado_em` | Temporal | Baixo risco | Pode revelar padrão de horário quando combinado com geo |

#### Tabela `chamado_fotos`

| Campo | Tipo de dado | Pessoal? | Observação |
|-------|-------------|----------|------------|
| `storage_key` | Referência a objeto | Indiretamente | A foto em si pode conter rosto, placa, terceiros |
| `origem` | Operacional | Não | `cidadao` ou `equipe` |

#### Tabela `chamado_atualizacoes`

| Campo | Tipo de dado | Pessoal? | Observação |
|-------|-------------|----------|------------|
| `ator_id` | FK para `users` (servidor) | Sim | Identifica o servidor que atualizou |
| `comentario` | Textual livre | Potencialmente | Pode conter PII inadvertida |

**Categorias de titulares:**
- Cidadãos denunciantes (identificados ou anônimos).
- Terceiros que aparecem inadvertidamente em fotos.
- Servidores municipais que atendem os chamados.

---

### 5. Ciclo de Vida dos Dados — Denúncias

| Fase | Descrição |
|------|-----------|
| **Coleta** | App móvel envia `multipart` com foto, coordenadas e descrição. O app pede permissão de câmera e localização com justificativa clara; o cidadão pode recusar cada uma. |
| **Transmissão** | HTTPS exclusivamente. O app nunca acessa o storage diretamente; a foto vai à API (NestJS) que valida, sanitiza e grava no MinIO. |
| **Armazenamento** | `chamados`: PostgreSQL com RLS por `tenant_id`. `chamado_fotos`: referência (`storage_key`) no banco; arquivo no MinIO. Dados cifrados em repouso (volume). |
| **Processamento** | Detecção de duplicados por proximidade (`ST_DWithin`, 30 m); classificação opcional por IA (ver item 7); roteamento à secretaria; atualização de status. |
| **Acesso** | Gestor/equipe: acesso ao chamado completo (incluindo geo e fotos) via painel interno. Cidadão: acesso ao próprio chamado por protocolo. Público: apenas `bairro`, `categoria`, `status` no mapa — sem geo exata, sem identidade do denunciante, sem foto. |
| **Retenção** | Ver política detalhada abaixo. |
| **Eliminação/Anonimização** | Ver política detalhada abaixo. |

#### Política de Retenção e Anonimização — Denúncias (recomendação concreta)

Esta política deve ser implementada como job de expurgo na fila `integracoes`.

| Dado | Evento-gatilho | Prazo após evento | Ação |
|------|---------------|-------------------|------|
| `geo` (coordenadas exatas) | Chamado marcado como `resolvido` ou `cancelado` | 90 dias | **Anonimizar:** substituir por centroide do bairro (`bairro_centroid`) ou nulo. Preservar `bairro` para estatísticas. |
| `cidadao_id` (vínculo de identidade) | Chamado marcado como `resolvido` ou `cancelado` | 90 dias | **Desvincular:** setar `cidadao_id = NULL` (já tem `ON DELETE SET NULL`; aplicar também por job após 90 dias, independentemente de exclusão do usuário). |
| Fotos (`chamado_fotos`) | Chamado marcado como `resolvido` ou `cancelado` | 6 meses | **Excluir** do storage (MinIO) e a referência do banco. Foto serve para comprovação e inspeção de campo — após resolução e prazo de contestação, não há mais finalidade. |
| `descricao` (texto livre) | Chamado arquivado (resolvido/cancelado + 1 ano) | 1 ano | **Anonimizar:** substituir por `[DESCRIÇÃO REMOVIDA — PRAZO DE RETENÇÃO EXPIRADO]`. Preservar categoria, bairro, datas e status para estatísticas. |
| Registro completo do chamado | Chamado arquivado | 2 anos após arquivamento | **Anonimizar** todos os campos pessoais remanescentes. O registro de ocorrência (protocolo, categoria, bairro, datas) é mantido indefinidamente para fins de estatística e controle da gestão pública. |
| `chamado_atualizacoes` (`ator_id`) | Chamado arquivado + 5 anos | 5 anos | Manter para auditoria interna; após 5 anos, setar `ator_id = NULL` (servidor anônimo). |

**Chamados abertos sem resolução:** Se um chamado permanecer sem resolução por mais de 2 anos, iniciar o ciclo de anonimização da geolocalização e identidade, mas manter o chamado ativo para acompanhamento.

**Justificativa do prazo de 90 dias para geo e identidade pós-resolução:** Período suficiente para contestação do fechamento pelo cidadão (equivalente ao prazo de Ouvidoria — 30+30 dias, com margem), sem manter dados de localização além do necessário.

---

### 6. Avaliação de Riscos — Denúncias Georreferenciadas

| ID | Risco ao Titular | Probabilidade | Impacto | Nível |
|----|-----------------|--------------|---------|-------|
| R-01 | Geolocalização exata revela endereço residencial do denunciante, permitindo identificação e retaliação | M | A | **Alto** |
| R-02 | Acúmulo de chamados de um mesmo cidadão revela rotina (horários, locais frequentados) | M | A | **Alto** |
| R-03 | Foto contém rosto do denunciante, rosto de terceiros ou placa de veículo, possibilitando identificação de pessoas não consentidas | A | M | **Alto** |
| R-04 | Denúncia de terreno abandonado ou animal pertencente a pessoa identificável expõe o denunciado sem contraditório | M | M | **Médio** |
| R-05 | Mapa público de chamados próximos com geo exata permite rastrear o denunciante | B | A | **Médio** |
| R-06 | Vazamento do banco expõe geolocalização e identidade em conjunto (dump completo) | B | A | **Médio** |
| R-07 | Servidor público interno abusa do acesso a chamados para identificar denunciantes de irregularidades (ameaça interna) | B | A | **Médio** |
| R-08 | Retenção indefinida da geolocalização exata além do prazo de finalidade | A | M | **Alto** |
| R-09 | Cidadão não percebe que está sendo identificado ao abrir chamado logado (falta de transparência) | M | M | **Médio** |
| R-10 | IA que processa fotos/descrição para triagem retém dados pessoais em logs da API externa (Anthropic) | M | M | **Médio** |

---

### 7. Medidas de Mitigação — Denúncias Georreferenciadas

#### Medidas já implementadas (ou previstas na arquitetura)

| Medida | Descrição | Status |
|--------|-----------|--------|
| Anonimato permitido | `cidadao_id` é `REFERENCES users(id) ON DELETE SET NULL` — campo nulo para chamados anônimos | Implementado no schema |
| RLS por tenant | `app_enable_tenant_rls('chamados')` e idem para `chamado_fotos` e `chamado_atualizacoes` | Implementado no schema |
| Fronteira de dados | App nunca acessa storage diretamente; foto vai via API (multipart) | Implementado (arquitetura) |
| HTTPS obrigatório | Cloudflare + Nginx; sem tráfego em claro | Implementado (infra) |
| RBAC para acesso interno | Apenas roles internas (`gestor`, `servidor`, `admin_prefeitura`) acessam dados completos | Previsto (RBAC na spec) |
| `ON DELETE SET NULL` em `cidadao_id` | Exclusão de usuário anonimiza o vínculo | Implementado no schema |

#### Medidas adicionais recomendadas (a implementar — ver checklist na Parte III)

| Medida | Risco mitigado | Prioridade |
|--------|---------------|------------|
| **Expor apenas `bairro`, `categoria` e `status` no mapa público** — nunca `geo` exata, `cidadao_id` ou `descricao` completa para usuários não autenticados | R-01, R-05 | Crítica |
| **Job de anonimização agendado** conforme política de retenção da seção 5 | R-08 | Crítica |
| **Campo `anonimo boolean`** na tabela `chamados` para registrar intenção explícita do cidadão (mesmo logado, pode optar por não vincular o chamado) | R-01, R-09 | Alta |
| **Flag `geo_anonimizada boolean`** e `geo_original` (apagado após 90 dias) — ou substituir `geo` pelo centroide do bairro no job de expurgo | R-01, R-08 | Alta |
| **Aviso de privacidade no app** antes de solicitar câmera/localização: finalidade, base legal, prazo de retenção, direito de anonimato | R-09 | Alta |
| **Metadados EXIF removidos** das fotos no backend antes de gravar no storage (ferramentas: `sharp` / `libvips`) — EXIF pode conter GPS embutido na foto, duplicando o risco de localização | R-03, R-06 | Alta |
| **`audit_log`** para todo acesso interno a chamado com `cidadao_id` preenchido (ator, timestamp, chamado_id) | R-07 | Alta |
| **Pseudonimização antes de enviar à IA** (Anthropic): substituir `cidadao_id`, `geo` e qualquer PII da `descricao` por tokens antes de chamar a API; não persistir resposta da IA com PII | R-10 | Alta |
| **Limitar consulta de chamados por cidadão** na API (não expor o histórico completo de chamados de um cidadão a outros usuários, mesmo autenticados) | R-02 | Média |
| **Graceful degradation de permissões** no app: se o cidadão negar localização, permitir seleção manual no mapa; se negar câmera, permitir chamado sem foto | Minimização | Média |
| **Separação do objeto de foto**: não expor `storage_key` em APIs públicas; URL assinada com TTL curto apenas para o cidadão titular e para a equipe interna | R-03, R-05 | Alta |
| **DPA com MinIO e Expo Notifications** formalizando o papel de subprocessadores | Conformidade | Alta |
| **SCCs com Anthropic** para uso de IA sobre dados de titulares brasileiros (LGPD art. 33) e europeus (GDPR art. 46), se o feature de IA for ativado | R-10, transferência int'l | Alta |

#### Decisão automatizada por IA (se ativada)

Se a IA (API Anthropic) for usada para classificar categoria, sugerir prioridade ou detectar duplicados com base na foto/descrição:
- **Base legal:** Art. 7º, III (política pública) + revisão humana obrigatória (servidor valida a triagem antes de rotear).
- **Decisão automatizada:** A IA não decide — sugere. O servidor humano confirma antes de qualquer efeito jurídico sobre o chamado.
- **Documentar no sistema:** qual model foi usado, timestamp da sugestão, se houve revisão humana e quem revisou.
- **Pseudonimização obrigatória:** `geo`, `cidadao_id` e qualquer PII extraída da `descricao` devem ser removidos ou tokenizados antes do envio à API Anthropic. Apenas o texto da categoria provável e a descrição sanitizada são enviados.

---

### 8. Riscos Residuais e Conclusão — Denúncias Georreferenciadas

**Risco residual principal:** O risco R-01 (geolocalização revela endereço do denunciante) é inerente ao serviço, mas é **reduzido a aceitável** pela combinação de: anonimato opcional, não exposição da geo exata no mapa público, anonimização após 90 dias da resolução, e controle de acesso interno com auditoria. O risco zero exigiria não coletar localização, o que tornaria o serviço inviável.

O risco R-03 (fotos com terceiros) é mitigado pela remoção de EXIF e pela restrição de acesso à foto, mas não pode ser eliminado sem revisar manualmente cada imagem — o que não é escalonável. A medida de retenção limitada (exclusão em 6 meses após resolução) é a principal mitigação de longo prazo.

**Conclusão: CONDICIONAL — não liberar para produção sem os itens marcados como "Crítica" e "Alta" no quadro de medidas**

O tratamento é legítimo e amparado em política pública. Entretanto, o módulo Chamados, conforme o schema atual (`db/005_app_cidadao_postgis.sql`), **não possui** os campos e mecanismos de privacidade exigidos. A liberação está condicionada à implementação dos itens descritos no checklist da Parte III abaixo.

---

## Parte III — Checklist Técnico para o Desenvolvedor do Módulo Chamados

Este checklist traduz as recomendações do DPIA em itens concretos que o backend do módulo Chamados deve implementar. O desenvolvedor deve garantir cada item antes do go-live em produção.

### Schema / Migration (backend DBA)

- [ ] **Adicionar campo `anonimo boolean NOT NULL DEFAULT false`** na tabela `chamados`. Quando `true`, o `cidadao_id` deve ser nulo mesmo que o cidadão esteja autenticado (o app deve enviar a intenção; o backend deve honrá-la).
- [ ] **Adicionar campo `geo_anonimizada boolean NOT NULL DEFAULT false`** na tabela `chamados`, para sinalizar que a coordenada exata foi substituída pelo centroide do bairro.
- [ ] **Adicionar campo `descricao_anonimizada boolean NOT NULL DEFAULT false`** para sinalizar que o texto foi substituído pela mensagem padrão de expiração.
- [ ] **Adicionar campo `fotos_expurgadas boolean NOT NULL DEFAULT false`** para sinalizar que as fotos foram excluídas do storage e do banco.
- [ ] **Adicionar campo `identidade_desvinculada_em timestamptz`** para registrar quando o `cidadao_id` foi anonimizado pelo job (distingue do `ON DELETE SET NULL` que ocorre quando o usuário deleta a conta).
- [ ] Garantir que `cidadao_id` permanece `REFERENCES users(id) ON DELETE SET NULL` (já está; confirmar).
- [ ] **Índice em `chamados (tenant_id, status, resolvido_em)`** para o job de expurgo localizar eficientemente os registros elegíveis.

### API — Contrato de Dados (NestJS service/controller)

- [ ] **`POST /api/chamados`:** aceitar campo `anonimo: boolean` no payload. Se `true`, gravar `cidadao_id = null` mesmo que o JWT esteja presente. Nunca forçar identificação.
- [ ] **`GET /api/chamados/proximos` (público sem auth):** retornar apenas `{ categoria, status, bairro, protocolo }`. Nunca retornar `geo` (coordenadas exatas), `cidadao_id`, `descricao` completa ou qualquer dado que permita identificar o denunciante.
- [ ] **`GET /api/chamados/:protocolo` (cidadão titular):** retornar dados completos do próprio chamado (incluindo geo e status das fotos). Restringir ao `cidadao_id` do JWT — nenhum outro cidadão pode consultar chamado alheio pelo protocolo.
- [ ] **Acesso interno (gestor/servidor):** RBAC obrigatório (`@Roles('gestor', 'servidor', 'admin_prefeitura')`); registrar acesso a chamados com `cidadao_id` preenchido no `audit_log` com `{ ator_id, chamado_id, acao: 'acesso_dado_pessoal', timestamp }`.
- [ ] **Fotos:** nunca retornar `storage_key` em APIs públicas. Gerar URL assinada com TTL de 15 minutos apenas para: (a) o cidadão titular via JWT validado, (b) o servidor interno autenticado. URL assinada gerada pelo backend, nunca pelo frontend.
- [ ] **Remoção de EXIF** no backend antes de gravar foto no MinIO: usar `sharp` (Node.js) para re-codificar a imagem sem metadados. O EXIF pode conter coordenadas GPS independentes do campo `geo`.

### Job de Anonimização (BullMQ / worker)

- [ ] **Nome do job:** `JOB_CHAMADOS_EXPURGO` (constante em `queue.constants.ts`).
- [ ] **Frequência:** diária (cron `0 2 * * *`).
- [ ] **Lógica:**
  - Buscar chamados com `status IN ('resolvido', 'cancelado') AND resolvido_em < NOW() - INTERVAL '90 days' AND geo_anonimizada = false` → substituir `geo` pelo centroide do bairro (ou `NULL`); setar `cidadao_id = NULL`; setar `geo_anonimizada = true`; gravar `identidade_desvinculada_em = NOW()`.
  - Buscar chamados com `status IN ('resolvido', 'cancelado') AND resolvido_em < NOW() - INTERVAL '6 months' AND fotos_expurgadas = false` → excluir objetos do MinIO (via `storage_key`); excluir registros de `chamado_fotos`; setar `fotos_expurgadas = true`.
  - Buscar chamados arquivados (`resolvido_em < NOW() - INTERVAL '1 year' AND descricao_anonimizada = false`) → substituir `descricao` por `[DESCRIÇÃO REMOVIDA — PRAZO DE RETENÇÃO EXPIRADO]`; setar `descricao_anonimizada = true`.
  - Buscar chamados abertos sem atualização há mais de 2 anos → iniciar anonimização de `geo` e `cidadao_id` (mesmo sem resolução formal).
- [ ] **Idempotência:** o job deve ser seguro para re-execução (os flags `*_anonimizada`/`*_expurgadas` garantem isso).
- [ ] **Registrar cada operação de expurgo no `audit_log`** com `{ acao: 'expurgo_chamado', chamado_id, campos_anonimizados: [...], timestamp }`.

### Aviso de Privacidade no App (mobile)

- [ ] **Tela de consentimento antes da primeira abertura de chamado:** explicar que a localização e a foto serão enviadas à prefeitura, finalidade, prazo de retenção e direito de usar anonimato. Botão "Entendo" registrado localmente (não é consentimento para base legal — o tratamento é política pública; é transparência informacional conforme LGPD art. 9º).
- [ ] **Opção "Enviar anonimamente"** visível na tela de abertura de chamado, independentemente de o cidadão estar logado.
- [ ] **Justificativa contextual** ao solicitar permissão de câmera e localização (texto explicativo antes do prompt do SO).
- [ ] **Graceful degradation:** chamado sem foto e com localização manual no mapa devem ser funcionais.

### Transferência Internacional — IA (se ativada)

- [ ] Antes de ativar triagem por IA (Anthropic): assinar DPA com Anthropic (inclui SCCs para LGPD e GDPR).
- [ ] Implementar pseudonimização no serviço antes do envio: remover `cidadao_id`, `geo`, qualquer substring que pareça CPF/nome do payload enviado à API Anthropic.
- [ ] Documentar no `audit_log` cada chamada de IA com `{ chamado_id_hash, modelo, timestamp }` — nunca o conteúdo completo.
- [ ] Garantir que a resposta da IA é descartada após uso (não persistida além da transação de triagem).

---

## Atualização do ROPA (Registro de Operações de Tratamento)

As entradas abaixo complementam o ROPA de `docs/06-lgpd-gdpr.md`.

| # | Operação | Categorias de dados | Titulares | Base legal LGPD | Retenção | Compartilhamento | Medidas de segurança |
|---|----------|--------------------|-----------|-----------------|-----------|--------------------|----------------------|
| 2 | Folha de pagamento (pública) | nome, cargo, vínculo, órgão, remuneração, matrícula mascarada | Servidores públicos | Art. 7º, II (LC 131/2009) + art. 23 | Permanente (acervo público) | Publicação aberta controlada | Sem CPF; matrícula mascarada; `nome_suprimido` para medidas protetivas; rate limiting; RLS; criptografia em trânsito e repouso |
| 5a | Chamados — identificação do denunciante | `cidadao_id` (FK), nome/e-mail via `users` | Cidadãos (opcional — nulo se anônimo) | Art. 7º, III (política pública) | Desvinculado em até 90 dias após resolução | Secretaria competente (interno) | RLS; `anonimo` flag; job de expurgo; audit_log de acesso |
| 5b | Chamados — geolocalização | `geo` (Point WGS84), `endereco`, `bairro` | Cidadãos | Art. 7º, III (política pública) | Precisa: 90 dias pós-resolução; bairro: permanente para estatísticas | Secretaria competente; equipe de campo (interno) | RLS; `geo_anonimizada` flag; job de expurgo; nunca exposta em API pública |
| 5c | Chamados — fotos | `storage_key` (referência); arquivo no MinIO | Cidadãos e terceiros inadvertidos | Art. 7º, III (política pública) | 6 meses pós-resolução | Secretaria competente (URL assinada com TTL) | EXIF removido no backend; URL assinada; RLS; job de expurgo |
| 5d | Chamados — descrição textual | Texto livre (pode conter PII) | Cidadãos e terceiros mencionados | Art. 7º, III (política pública) | 1 ano após arquivamento | Secretaria competente (interno) | Anonimização por job; sem exposição em API pública sem auth |

---

---

## Parte III — IA Assistida (Triagem de Manifestações, RAG, Chat e OCR)

**Adendo elaborado em:** 2026-06-03
**Elaborado por:** Encarregado de Dados (DPO) — subagent `lgpd-gdpr-dpo`
**Escopo deste adendo:** Tratamento de dados pessoais pela camada de Inteligência Artificial implementada em `api/src/modules/ia/` (módulos `AnthropicService`, `IaService`, `ia.prompts.ts`), compreendendo: (1) triagem de manifestações de Ouvidoria e ESIC; (2) busca semântica por RAG sobre o CMS do tenant; (3) chatbot de atendimento ao cidadão; (4) OCR de documentos via Anthropic Vision (previsto — não ainda em produção).
**Referência normativa principal:** LGPD arts. 5º XVII, 6º, 7º, 11, 20, 23–26, 33–36, 41; Guia Orientativo de DPIA — ANPD (2022); Nota Técnica ANPD n.º 1/2021 (transferências internacionais); Nota de orientação ANPD sobre IA (2023).

---

### 1. Identificação do Tratamento

| Campo | Valor |
|-------|-------|
| Nome do tratamento | Tratamento de dados pessoais por sistema de IA assistida para triagem de manifestações, busca RAG e atendimento ao cidadão por chatbot |
| Módulo | `api/src/modules/ia/` |
| Serviços principais | `IaService` (lógica), `AnthropicService` (cliente API externa), `ia.prompts.ts` (prompts e parsing) |
| Endpoints | `POST /ia/triagem` (interno, RBAC), `POST /ia/busca` (público), `POST /ia/chat` (público) |
| Status do OCR | Previsto — não em produção; avaliado preventivamente neste adendo |
| Data de início | Go-live do módulo IA (a definir por tenant; feature flag por tenant recomendada) |
| Controlador | Prefeitura Municipal contratante (tenant). |
| Operador | Empresa operadora da plataforma SaaS. |
| Subprocessador de IA | Anthropic PBC (EUA) — API Claude. Processamento ocorre fora do Brasil (transferência internacional). |
| Encarregado (DPO) | A nomear por cada prefeitura (LGPD art. 41). |

---

### 2. Finalidades e Bases Legais por Subfuncionalidade

A camada de IA cobre três finalidades distintas com bases legais distintas. O enquadramento correto de cada finalidade é obrigatório para que o tratamento seja legítimo.

#### 2.1 Triagem de Manifestações (Ouvidoria e ESIC)

**Finalidade:** Auxiliar o servidor público na classificação inicial de manifestações recebidas pela Ouvidoria (Lei 13.460/2017) e pelo ESIC (LAI 12.527/2011), sugerindo tipo, secretaria competente e prioridade. O objetivo é aumentar a eficiência do processo de atendimento — um serviço público legalmente obrigatório.

**O que o modelo recebe:** `canal` (ouvidoria/ESIC), `assunto` (texto livre digitado pelo cidadão) e `descricao` (texto livre do corpo da manifestação). Nenhum dado identificador do solicitante — nome, e-mail, CPF, protocolo, `cidadao_id` — é enviado ao modelo. Isso está implementado em `ia.prompts.ts` (`usuarioTriagem`) e confirmado em `ia.service.ts` (o `select` da query busca apenas `canal`, `assunto` e `descricao`).

**Base legal LGPD:** Art. 7º, III (execução de política pública — gestão das manifestações de Ouvidoria e ESIC é política pública obrigatória por lei) combinado com o art. 23 (tratamento pelo Poder Público para execução de suas competências legais). A finalidade é determinada em lei (Lei 13.460/2017 e Lei 12.527/2011); o consentimento do cidadão **não** é a base legal, nem é necessário.

**Base legal LGPD para eventual dado sensível na descrição:** Se o conteúdo da manifestação revelar dado sensível (art. 11) — por exemplo, uma denúncia que mencione saúde, orientação política ou raça de terceiro —, a base legal muda para art. 11, II, "b" (cumprimento de obrigação legal ou regulatória pelo controlador público). A triagem por IA sobre esse conteúdo permanece coberta, pois o tratamento do dado sensível já ocorre na Ouvidoria/ESIC pela mesma base; a IA apenas apoia o processo, sem tomar decisão autônoma.

**Base legal GDPR (titulares UE, improvável mas coberto):** Art. 6.1(e) — tarefa no exercício de autoridade pública; Art. 9.2(g) — interesse público relevante, para eventual dado sensível de titular europeu.

#### 2.2 Busca Semântica (RAG) sobre o CMS do Tenant

**Finalidade:** Permitir que cidadãos encontrem informações em conteúdo oficial publicado pela prefeitura (páginas e blocos do CMS), com retorno de trechos e citação de fonte.

**O que o modelo recebe:** A pergunta digitada pelo cidadão mais os trechos recuperados do CMS. A pergunta é dado pessoal apenas se o cidadão incluir informações sobre si mesmo no texto livre (risco residual — ver seção 6, R-03).

**Base legal LGPD:** Art. 7º, VI (legítimo interesse do controlador ou de terceiro), ponderado com os direitos do titular: a busca RAG atende interesse público de acesso à informação sem criar perfil do usuário, sem retenção do conteúdo e sem produzir decisão sobre o cidadão. Para tenants que optem por chat autenticado com histórico de conversas, a base migra para art. 7º, I (consentimento livre e informado), mediante aviso de privacidade antes da primeira interação.

**Base legal GDPR:** Art. 6.1(f) — legítimo interesse, para o chat público sem identificação; art. 6.1(a) para versão autenticada com histórico.

**Nota sobre o chat público:** O endpoint `POST /ia/chat` é atualmente aberto sem autenticação (conforme `ia.controller.ts`). Isso significa que a pergunta do cidadão é enviada à API Anthropic sem qualquer identificador de sessão ou de usuário, reduzindo o risco de vinculação a uma pessoa identificável. Entretanto, o IP do cliente é registrado pelo servidor. Recomenda-se que o backend não inclua o IP nos dados enviados ao modelo.

#### 2.3 OCR de Documentos (Previsto — Anthropic Vision)

**Finalidade:** Extrair texto de documentos (imagens, PDFs escaneados) anexados a solicitações ESIC ou a chamados do app do cidadão, para indexação e triagem.

**O que o modelo receberá:** Imagem do documento (base64 ou URL). O documento pode conter dados pessoais de terceiros não relacionados ao solicitante (por exemplo, um documento administrativo com nome de servidor, número de processo, CPF de terceiros).

**Base legal LGPD:** Art. 7º, II (cumprimento de obrigação legal — ESIC/LAI) e art. 7º, III (execução de política pública). O OCR é um meio de viabilizar o atendimento dentro do prazo legal; sua base acompanha a do processo principal.

---

### 3. Análise da Decisão Automatizada — LGPD Art. 20

#### 3.1 Enquadramento do Tratamento

O art. 20 da LGPD estabelece que "o titular dos dados tem direito a solicitar a revisão de decisões tomadas unicamente com base em tratamento automatizado de dados pessoais que afetem seus interesses, incluídas as decisões destinadas a definir o seu perfil pessoal, profissional, de consumo e de crédito ou os aspectos de sua personalidade."

A triagem por IA no presente sistema **não constitui "decisão tomada unicamente com base em tratamento automatizado"** para os fins do art. 20, pelos seguintes motivos, documentados no código e na arquitetura:

1. **Saída explicitamente marcada como sugestão:** O retorno de `IaService.triagem()` inclui o campo `revisaoHumana: true`, sinalizando ao sistema consumidor que a IA produziu sugestão, não decisão. O system prompt do modelo reitera: "Sua resposta é uma SUGESTÃO para revisão humana — nunca uma decisão final."

2. **Ausência de automação da consequência:** A API não aplica automaticamente a triagem sugerida à manifestação. O servidor humano (role `OUVIDOR`, `GESTOR` ou `ADMIN_PREFEITURA`) deve confirmar ou corrigir antes de qualquer efeito jurídico sobre o chamado (roteamento à secretaria, prazos, arquivamento).

3. **Endpoint com RBAC interno:** `POST /ia/triagem` exige autenticação e role qualificada (`@Roles(Role.OUVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)`). O cidadão não tem acesso direto ao resultado da triagem — o que chega ao cidadão é o protocolo e o status do atendimento, gerados pelo fluxo humano posterior.

#### 3.2 Posição da ANPD sobre IA e Art. 20

A ANPD, em suas orientações de 2023 sobre IA, reafirma que o art. 20 incide sobre decisões **exclusivamente automatizadas** com efeitos sobre o titular. Sistemas de apoio à decisão humana — onde o humano tem acesso à saída do modelo e pode revisar, corrigir e rejeitar — não estão sujeitos ao mesmo regime de revisão obrigatória, mas devem preservar a **possibilidade efetiva** de revisão e de contestação pelo titular. A CGU, em orientações sobre Ouvidoria digital, também aponta que o uso de IA em triagem é adequado quando mantida a revisão humana e o prazo legal de resposta.

#### 3.3 O que Deve Ser Implementado para Conformidade Plena com o Art. 20

Embora o desenho atual já escape do regime de "decisão exclusivamente automatizada", as recomendações abaixo garantem conformidade com o espírito do art. 20 e com as boas práticas da ANPD:

**a) Registro da revisão humana no banco de dados**

Deve existir um campo que documente que a sugestão de IA foi revisada e qual foi a ação do servidor. Recomenda-se adicionar à tabela `manifestacoes` (ou em tabela auxiliar `manifestacao_triagem`) os seguintes campos:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `ia_triagem_sugestao` | `jsonb` | Saída bruta da IA (tipo, secretaria, prioridade, resumo, confiança) |
| `ia_triagem_em` | `timestamptz` | Momento em que a sugestão foi gerada |
| `ia_triagem_revisada_por` | `uuid FK users` | Servidor que revisou a sugestão |
| `ia_triagem_revisada_em` | `timestamptz` | Momento da revisão humana |
| `ia_triagem_acao` | `text` | `'aceita'`, `'modificada'` ou `'rejeitada'` |
| `ia_triagem_justificativa` | `text` | Texto livre do servidor ao modificar/rejeitar (opcional, recomendado) |

Esses campos devem ser gravados pelo serviço de manifestações quando o servidor confirmar a triagem no painel interno, não pelo próprio `IaService`.

**b) Direito de explicação e contestação pelo cidadão (art. 20, §1º)**

O §1º do art. 20 assegura ao titular o direito de solicitar "revisão por pessoa natural de decisões tomadas com base em tratamento automatizado de dados pessoais." Para que este direito seja exercível:

- O aviso de privacidade da Ouvidoria/ESIC deve informar que a manifestação pode passar por triagem assistida por IA, que a triagem é sugestão revisada por servidor humano, e como o cidadão pode contestar o enquadramento.
- O canal de contestação já existe: o próprio recurso previsto pela LAI (art. 15) e pela Lei 13.460/2017 (arts. 8º e 10). O aviso de privacidade deve explicitar que o cidadão pode usar esses recursos caso discorde do enquadramento da sua manifestação.
- O DPO do tenant deve ser o ponto de contato para pedidos de explicação sobre o uso de IA no tratamento da manifestação específica do cidadão.

**c) Não usar a triagem de IA como único critério de arquivamento**

Especificamente: a IA nunca pode ser a razão direta para o arquivamento ou indeferimento de uma manifestação. Qualquer ação de encerramento deve ser produzida e registrada por um servidor identificado, com base legal própria.

---

### 4. Transferência Internacional — LGPD Arts. 33–36 e GDPR Arts. 44–46

#### 4.1 Caracterização da Transferência

A API Anthropic (Claude) é operada pela Anthropic PBC, empresa com sede nos EUA. Toda chamada ao `AnthropicService.completar()` implica envio de dados para servidores fora do Brasil. Isso caracteriza **transferência internacional de dados pessoais** nos termos do art. 33 da LGPD, independentemente do volume ou da natureza do dado transferido.

O Brasil ainda não publicou, até a data deste adendo (junho de 2026), a lista definitiva de países com grau de proteção adequado reconhecido pela ANPD. Os EUA não figuram em lista de adequação. Portanto, a transferência deve se apoiar em uma das hipóteses do art. 33, incisos I a IX.

#### 4.2 Hipótese Aplicável — Art. 33, VIII (Cláusulas-Padrão)

A hipótese mais robusta disponível é o **inciso VIII do art. 33**: transferência amparada em cláusulas-padrão contratuais. A Anthropic disponibiliza um **Data Processing Agreement (DPA)** com Standard Contractual Clauses (SCCs) compatíveis com as exigências europeias (GDPR art. 46.2.c), e a ANPD, na Nota Técnica n.º 1/2021 e nas orientações subsequentes, aceita SCCs como salvaguarda adequada para transferências da LGPD enquanto não há regulamentação específica de cláusulas-padrão nacionais.

**Acao obrigatória:** O DPA com Anthropic deve ser assinado antes do primeiro envio de dado pessoal real à API. O DPA deve cobrir:
- Finalidade limitada ao processamento das requisições da plataforma (proibição de uso para treino do modelo com dados enviados).
- Retenção zero: os dados submetidos via API não são retidos pela Anthropic para além do processamento da requisição (confirmar com o DPA vigente — a política atual da Anthropic para clientes API é de não treinar com dados de API; isso deve ser contratualizado, não apenas presumido).
- Obrigação de notificação de incidente em prazo compatível com LGPD (prazo razoável — ANPD não fixou prazo exato; adotar 72h por equivalência com o GDPR).
- Subprocessadores usados pela Anthropic: listar e aceitar (ou recusar) cada um.

#### 4.3 Avaliação do Risco de a Descrição Conter Dado Pessoal ou Sensível

O campo `descricao` da manifestação é texto livre digitado pelo cidadão. Embora o sistema envie apenas `assunto` e `descricao` (sem o identificador do solicitante), o próprio texto pode conter:

- Nome do cidadão ou de terceiro mencionado na manifestação.
- CPF, endereço, número de processo, dados de saúde ou outros dados sensíveis que o cidadão inclua para contextualizar a denúncia.
- Dados sensíveis de categoria especial (art. 11 LGPD): saúde, orientação sexual, religião, filiação política.

Essa possibilidade não pode ser eliminada por controle técnico apenas, pois a qualidade e a utilidade da triagem dependem da descrição do problema. As mitigações são:

**Mitigação 1 — Aviso ao cidadão no formulário de manifestação**

Antes do envio da manifestação, o formulário deve exibir aviso claro (LGPD art. 9º, transparência): "Sua manifestação pode ser analisada por sistema de inteligência artificial para apoio à triagem. Não inclua CPF, dados de saúde ou informações sensíveis de terceiros que não sejam necessários para sua manifestação. O texto será enviado a um processador externo nos EUA, com garantias contratuais de proteção."

**Mitigacao 2 — Opção de não usar IA**

O tenant deve poder desativar a triagem por IA para uma manifestação ou para todas (feature flag por tenant). Quando desativada, a triagem é realizada apenas por servidor humano. O cidadão deve poder solicitar essa opção como exercício do direito de oposição (LGPD art. 18, IX) ao tratamento por IA.

**Mitigacao 3 — Retenção zero no provedor**

O DPA com a Anthropic deve incluir cláusula expressa de que os dados submetidos via API não são retidos, armazenados ou usados para qualquer finalidade além do processamento imediato da requisição. Confirmar que a política atual ("we do not train on API data") está contratualizada. A retenção zero é a principal salvaguarda técnica disponível para o cenário de dado sensível na descrição.

**Mitigacao 4 — Sanitização pré-envio (recomendada para evolução futura)**

Evoluir o `usuarioTriagem()` em `ia.prompts.ts` para incluir uma etapa de sanitização automática que detecte e remova (ou substitua por `[DADO REMOVIDO]`) padrões de CPF (11 dígitos com ou sem pontuação), números de RG, e-mails e números de telefone do texto antes do envio ao modelo. Isso não garante remoção de todos os dados pessoais, mas reduz o risco dos dados estruturados mais comuns.

#### 4.4 GDPR — Para Cidadãos na UE

Se a plataforma for usada por prefeituras com cidadãos titulares na UE (improvável, mas previsto em `docs/06-lgpd-gdpr.md`), as SCCs no DPA com Anthropic cobrem a transferência UE → EUA sob o GDPR art. 46.2(c). Verificar se o Data Privacy Framework (DPF) UE–EUA cobre a Anthropic (confirmar auto-certificação); se sim, o art. 45 do GDPR pode ser usado alternativamente. Para dados sensíveis de titulares UE (GDPR art. 9), a base legal para a transferência deve ser explicitada no DPA.

---

### 5. OCR de Documentos — Avaliação de Risco e Recomendações

#### 5.1 Risco Específico do OCR

O envio de imagens de documentos para a API Anthropic Vision cria um risco qualitativamente diferente da triagem de texto:

- **Extração de dado pessoal de terceiros:** Um documento ESIC pode conter um ofício administrativo com nomes de servidores, número de CPF de credor, dados de processo judicial, laudo médico de outro cidadão. O modelo extrai esses dados como texto, que então circula na camada de aplicação.
- **Dado sensível extraído:** Laudos, contratos de saúde, documentos de identificação, fichas funcionais podem conter categorias especiais de dados (art. 11 LGPD) de pessoas que não são o solicitante e que não deram qualquer consentimento.
- **Transferência internacional amplificada:** Ao contrário do texto da descrição (que pode ser sanitizado), a imagem é transferida na íntegra. Todos os dados visíveis no documento são transferidos ao processador externo.

#### 5.2 Base Legal para o OCR

A base legal é a mesma do processo principal que origina o documento: art. 7º, II (obrigação legal — ESIC/LAI) ou art. 7º, III (política pública). O OCR é um meio técnico a serviço dessa finalidade, não uma finalidade autônoma. Para dados sensíveis extraídos: art. 11, II, "b" (cumprimento de obrigação legal pelo controlador público).

O tratamento dos dados de terceiros extraídos do documento segue o princípio da finalidade (art. 6º, I): os dados de terceiros que aparecem no documento são tratados exclusivamente para o processamento da solicitação, e não podem ser utilizados para qualquer outra finalidade.

#### 5.3 Recomendações de Minimização para o OCR

**a) Retenção zero do texto extraído além da transação**

O texto produzido pelo OCR deve ser usado imediatamente (indexação, triagem) e descartado ou retido apenas pelo prazo estritamente necessário para a finalidade. Não deve ser gravado em tabela de texto em claro com prazo indeterminado. Se for necessário indexar o conteúdo extraído para busca futura, armazenar apenas os tokens de busca (ou embedding), não o texto original completo.

**b) Retenção do texto extraído no banco**

Caso o texto extraído seja necessário para fins processuais (ex.: indexação do processo ESIC), a retenção deve seguir o mesmo prazo do processo: 10 anos conforme portaria CGU, com anonimização dos dados pessoais de terceiros após o prazo. Adicionar coluna `ocr_texto` (ou tabela separada `manifestacao_documentos_ocr`) com campo `retencao_expira_em` e job de expurgo.

**c) Aviso ao solicitante**

O formulário de upload de documentos deve informar que o documento será processado por sistema de IA para extração de texto, que o arquivo pode conter dados de terceiros, e que esses dados serão tratados exclusivamente para atender à solicitação, com base na LAI.

**d) Não enviar documentos de categorias especiais sem aviso adicional**

Se o tipo de documento selecionado pelo cidadão for reconhecidamente sensível (ex.: laudo médico, certidão de antecedentes criminais), o sistema deve exibir aviso adicional e solicitar confirmação explícita do cidadão antes do upload para processamento por IA.

**e) DPA com cobertura de imagens**

O DPA com Anthropic deve cobrir explicitamente o envio de imagens (API Vision), pois tecnicamente é uma modalidade diferente de dado. Confirmar que a cláusula de retenção zero se aplica também às imagens enviadas.

---

### 6. Retenção e Logging — O que vai ao `audit_log` e o que não vai

#### 6.1 O que deve ser registrado no `audit_log`

O `IaService` já registra no `audit_log` via método `auditar()`. O modelo atual de registro está conforme:

- **Para triagem:** `acao: 'IA_TRIAGEM'`, `entidade: 'manifestacao'`, `entidadeId: manifestacaoId`, `dados: { prioridade, tipoSugerido }`. Correto — registra o evento sem persistir o conteúdo da manifestação ou a resposta completa do modelo.
- **Para chat:** `acao: 'IA_CHAT'`, `entidade: 'cms'`, `entidadeId: null`, `dados: { fontes: N }`. Correto — registra apenas o número de fontes recuperadas, sem o texto da pergunta.

Esses registros atendem ao princípio de mínimo necessário para auditoria: permitem saber que a IA foi usada, quando, por quem (via `atorId`) e com qual resultado agregado, sem replicar dado pessoal no log.

#### 6.2 O que NÃO deve ir ao `audit_log` nem a nenhuma tabela persistente

- **O texto completo da `descricao` ou do `assunto`** da manifestação (já está no banco da manifestação com controle de acesso e retenção próprios; duplicar no log viola minimização).
- **A resposta completa do modelo** (pode conter paráfrase de dado pessoal presente na entrada).
- **O texto da pergunta do chat** feita pelo cidadão (potencialmente dado pessoal se o cidadão incluir informações sobre si).
- **As imagens enviadas para OCR** (nunca devem ser salvas em log; o log registra apenas o evento de processamento: `acao: 'IA_OCR'`, `entidadeId`, `dados: { paginas: N, caracteres: N }`).
- **O IP do cliente** no contexto de chamadas ao modelo (o IP deve aparecer no log de acesso HTTP, não no dado enviado à Anthropic).

#### 6.3 Retenção de Dados de IA no Provedor (Anthropic)

Retenção zero é a meta: os dados enviados à API Anthropic não devem ser retidos pelo provedor além do processamento da requisição. Isso deve ser:

1. Contratualizado no DPA (ver seção 4.2).
2. Verificado periodicamente (o DPA deve incluir obrigação de notificação de mudança de política de retenção).
3. Documentado como medida de segurança no ROPA (coluna "Medidas de segurança" — entrada #6 do ROPA de `docs/06-lgpd-gdpr.md`).

A Anthropic, na política de API atual (junho de 2026), não usa dados de API para treino de modelos e retém os dados de requisição por até 30 dias para fins de segurança e moderação de conteúdo, conforme sua política de uso. Esse prazo de 30 dias deve ser avaliado no contexto do risco (dado sensível eventual na descrição) e contratualizado para ser o menor prazo possível. O DPA deve exigir que qualquer retenção seja exclusivamente para fins de segurança e jamais para treino ou análise de produto.

---

### 7. Avaliação de Riscos — IA Assistida

| ID | Risco ao Titular | Probabilidade | Impacto | Nível |
|----|-----------------|--------------|---------|-------|
| R-IA-01 | Texto da descrição contém CPF/dado sensível do cidadão e é transferido à Anthropic sem sanitização | M | A | **Alto** |
| R-IA-02 | Triagem de IA usada como critério real de arquivamento sem revisão humana efetiva (compliance formal sem substância) | M | A | **Alto** |
| R-IA-03 | Cidadão não é informado de que sua manifestação será processada por IA e por provedor externo (ausência de transparência) | A | M | **Alto** |
| R-IA-04 | OCR extrai dado pessoal/sensível de terceiros de documento e esse texto é retido indefinidamente | M | A | **Alto** |
| R-IA-05 | Retenção de dados pela Anthropic além do necessário (30 dias de política atual — dados eventualmente sensíveis expostos a incidente no provedor) | B | A | **Médio** |
| R-IA-06 | Chat público recebe pergunta com dado pessoal do cidadão (ex.: "meu CPF é X, pode verificar?") e esse dado é enviado ao modelo sem controle | A | M | **Alto** |
| R-IA-07 | Ausência de DPA assinado com Anthropic — transferência internacional sem salvaguarda contratual | A | A | **Crítico** |
| R-IA-08 | Ausência de mecanismo de contestação documentado e acessível para o cidadão questionar o enquadramento de sua manifestação | M | M | **Médio** |
| R-IA-09 | Tenants ativam IA sem feature flag — cidadão de município sem consciência do uso de IA tem manifestação processada externamente | M | M | **Médio** |
| R-IA-10 | Sugestão de IA persiste no banco sem campo que registre revisão humana — impossível auditar se houve revisão real | A | M | **Alto** |

---

### 8. Medidas de Mitigação — IA Assistida

#### Medidas já implementadas (confirmadas no código)

| Medida | Descrição | Referência no código |
|--------|-----------|---------------------|
| Minimização no envio ao modelo | `select` da query busca apenas `canal`, `assunto`, `descricao` — sem `cidadao_id`, CPF, nome, endereço | `ia.service.ts` linhas 35–37 |
| Revisão humana sinalizada | Retorno inclui `revisaoHumana: true` | `ia.service.ts` linha 57 |
| RBAC no endpoint de triagem | `POST /ia/triagem` restrito a roles internas qualificadas | `ia.controller.ts` linhas 17–19 |
| RLS no RAG | Recuperação de trechos CMS via `PrismaService` com RLS ativo — sem vazamento entre tenants | `ia.service.ts` método `recuperar()` |
| Auditoria de cada chamada | `auditar()` registra evento sem conteúdo pessoal | `ia.service.ts` linhas 102–118 |
| System prompt marca sugestão | Modelo instruído a produzir sugestão, não decisão | `ia.prompts.ts` linha última do `sistemaTriagem()` |
| Degradação graciosa | Sem chave configurada, API retorna 503 sem expor dado | `anthropic.service.ts` linhas 18–28 |

#### Medidas a implementar (obrigatórias antes do go-live em produção)

| Medida | Risco mitigado | Prioridade |
|--------|---------------|------------|
| **Assinar DPA com Anthropic** com SCCs, cláusula de retenção zero e proibição de uso para treino | R-IA-07 | Critica — bloqueia produção |
| **Feature flag por tenant** (`ia_triagem_habilitada`, `ia_chat_habilitada`) controlada pelo `admin_prefeitura`; padrão desabilitado | R-IA-09 | Critica |
| **Campos de revisão humana** na tabela `manifestacoes` ou tabela auxiliar (ver seção 3.3.a) | R-IA-10, R-IA-02 | Critica |
| **Aviso de privacidade no formulário** de manifestação sobre uso de IA e provedor externo (LGPD art. 9º) | R-IA-03 | Critica |
| **Aviso no chat público** informando que a pergunta será enviada a processador externo e orientando a não incluir dados pessoais | R-IA-06, R-IA-03 | Alta |
| **Opção de opt-out de IA** para o cidadão (parâmetro `sem_ia: boolean` no formulário de manifestação; quando `true`, desvia do `IaService`) | R-IA-03, exercício art. 18 IX | Alta |
| **Sanitização automática pré-envio** de padrões de CPF, RG, e-mail e telefone no texto da descrição antes do `usuarioTriagem()` | R-IA-01 | Alta |
| **Aviso adicional para OCR de documentos sensíveis** (antes de implementar o feature); retenção zero do texto extraído | R-IA-04 | Alta — bloqueia feature OCR |
| **Não persistir resposta completa do modelo** — verificar que nenhum serviço consumidor grava a saída do `IaService` em tabela de dados sem finalidade declarada | R-IA-01, R-IA-04 | Alta |
| **Documentar mecanismo de contestação** do enquadramento de manifestação no aviso de privacidade da Ouvidoria/ESIC, apontando para o canal de recurso da LAI e da Lei 13.460 | R-IA-08 | Média |
| **Renovar e rever periodicamente o DPA** com Anthropic — monitorar mudanças de política de retenção do provedor | R-IA-05 | Média (revisão anual) |

---

### 9. Riscos Residuais e Conclusão — IA Assistida

**Risco residual principal:** O risco R-IA-01 (descrição com dado pessoal transferida ao provedor externo) é inerente ao funcionamento do serviço de triagem. A mitigação por sanitização automática reduz o risco de dados estruturados (CPF, telefone), mas não elimina o risco de dado pessoal em texto livre narrativo (nome de terceiro mencionado na denúncia, por exemplo). A retenção zero no provedor é a salvaguarda crítica para esse risco residual.

O risco R-IA-06 (chat público com dado pessoal do cidadão) é alto por probabilidade — cidadãos frequentemente incluem seus dados em perguntas livres. A mitigação é o aviso explícito antes da interação e a retenção zero no provedor.

**Conclusão: CONDICIONAL — BLOQUEADO para produção sem os itens marcados como "Critica"**

O desenho técnico atual (minimização, RLS, RBAC, auditoria, sinalização de revisão humana) é adequado e bem estruturado. O principal gap não é técnico-arquitetural, mas contratual e informacional: a ausência do DPA com Anthropic bloqueia a produção; a ausência de aviso de privacidade cria irregularidade formal com o art. 9º da LGPD; e a ausência de campos de registro de revisão humana impede a auditoria do cumprimento do art. 20.

Com os itens "Critica" implementados, o tratamento passa a ser: **FAVORAVEL CONDICIONADO** ao monitoramento periódico do DPA e à extensão das medidas para o feature OCR quando for ativado.

---

### 10. ROPA — Entradas Atualizadas (Adendo IA)

As entradas abaixo complementam o ROPA de `docs/06-lgpd-gdpr.md` e a entrada #6 já existente, refinando-a.

| # | Operação | Categorias de dados | Titulares | Base legal LGPD | Retenção no sistema | Compartilhamento / Transferência int'l | Medidas de segurança |
|---|----------|--------------------|-----------|-----------------|--------------------|----------------------------------------|----------------------|
| 6a | IA — triagem de manifestação Ouvidoria/ESIC | `assunto` e `descricao` da manifestação (sem identificador do solicitante); pode conter PII/sensível inadvertido no texto livre | Cidadãos | Art. 7º, III + art. 23 (política pública); art. 11, II, "b" para dado sensível eventual | Não retido além da transação de triagem; sugestão persistida em `ia_triagem_sugestao` (jsonb) na tabela de manifestações | Anthropic PBC (EUA) — DPA + SCCs (art. 33, VIII LGPD); retenção zero contratualizada | Minimização: sem `cidadao_id` ou PII estruturado; sanitização de CPF/telefone pré-envio; RBAC; RLS; audit_log sem conteúdo |
| 6b | IA — chat/RAG público | Texto livre da pergunta do cidadão (dado pessoal se o cidadão se identificar); trechos do CMS (dado público) | Cidadãos | Art. 7º, VI (legítimo interesse) para chat público; art. 7º, I (consentimento) para chat autenticado com histórico | Não retido; pergunta não persistida | Anthropic PBC (EUA) — DPA + SCCs | Aviso de privacidade pré-chat; sem identificador de sessão/usuário enviado ao modelo; retenção zero; audit_log registra apenas `{ fontes: N }` |
| 6c | IA — OCR de documentos (previsto) | Imagem de documento (pode conter PII e dados sensíveis de terceiros) | Cidadãos + terceiros no documento | Art. 7º, II (obrigação legal LAI) + art. 7º, III; art. 11, II, "b" para sensíveis | Texto extraído: retido pelo prazo do processo (10 anos) com anonimização de PII de terceiros ao expirar | Anthropic PBC (EUA) — DPA com cobertura de Vision API + SCCs | Aviso ao cidadão; DPA cobre Vision; retenção zero de imagem no provedor; texto extraído protegido por RLS; job de expurgo ao fim do prazo |

---

## Parte IV — Checklist Técnico para o Desenvolvedor do Módulo IA

Este checklist traduz as recomendações das seções 3 a 9 deste adendo em itens concretos que o backend do módulo IA deve implementar. Os itens marcados como "Critica" bloqueiam o go-live em produção.

### Contratual / Organizacional (responsabilidade do DPO e da gestão)

- [ ] **[CRITICO] Assinar o DPA com Anthropic** (disponível em anthropic.com/legal) antes de qualquer deploy em produção com dado real. O DPA deve incluir: SCCs (art. 33, VIII LGPD + GDPR art. 46), cláusula de não uso para treino de modelos, retenção mínima dos dados de requisição, notificação de incidente em 72h, e cobertura da API Vision para o feature OCR.
- [ ] **[CRITICO] Registrar o DPA no ROPA** e manter cópia acessível ao DPO do tenant.
- [ ] **Revisar o DPA anualmente** ou sempre que a Anthropic comunicar alteração de política de retenção ou subprocessadores.

### Feature Flags (NestJS / configuração por tenant)

- [ ] **[CRITICO] Implementar feature flags por tenant:** `ia_triagem_habilitada boolean` e `ia_chat_habilitada boolean` na tabela de configurações do tenant (ex.: `tenant_configs`). Padrão: `false` (opt-in, não opt-out).
- [ ] **[CRITICO] No `IaService.triagem()`:** verificar a flag `ia_triagem_habilitada` do tenant antes de chamar `AnthropicService`. Se `false`, retornar `{ revisaoHumana: true, iaDesabilitada: true }` sem chamar a API externa.
- [ ] **No `IaService.chat()`:** verificar `ia_chat_habilitada`. Se `false`, a busca/RAG interna (`recuperar()`) pode continuar funcionando, mas o passo de geração de resposta pelo modelo deve ser suprimido.

### Sanitização Pré-envio ao Modelo

- [ ] **Implementar `sanitizarTexto(texto: string): string`** em `ia.prompts.ts` ou em utilitário dedicado. A função deve substituir por `[DADO REMOVIDO]`: padrões de CPF (`\d{3}\.\d{3}\.\d{3}-\d{2}` e `\d{11}` isolado), RG (formatos estaduais comuns), e-mail (`\S+@\S+\.\S+`), e número de telefone (DDD + 8 ou 9 dígitos). Aplicar sobre `assunto` e `descricao` antes de `usuarioTriagem()`.
- [ ] **Logar (sem conteúdo) quando a sanitização substituir algo:** `audit_log` com `{ acao: 'IA_SANITIZACAO', campos: ['descricao'], ocorrencias: N }` para permitir análise estatística sem expor o dado.

### Registro de Revisão Humana (Schema / Migration)

- [ ] **[CRITICO] Criar migration** adicionando os campos de revisão humana à tabela `manifestacoes` (ou tabela auxiliar `manifestacao_triagem_ia`):
  - `ia_triagem_sugestao jsonb` — saída do `IaService.triagem()` (sem o `manifestacaoId` redundante).
  - `ia_triagem_em timestamptz` — timestamp da chamada à IA.
  - `ia_triagem_revisada_por uuid REFERENCES users(id) ON DELETE SET NULL`.
  - `ia_triagem_revisada_em timestamptz`.
  - `ia_triagem_acao text CHECK (ia_triagem_acao IN ('aceita','modificada','rejeitada'))`.
  - `ia_triagem_justificativa text` — opcional; preenchido quando `acao = 'modificada'` ou `'rejeitada'`.
- [ ] **[CRITICO] O endpoint de confirmação de triagem** (no serviço de manifestações, não no `IaService`) deve gravar `ia_triagem_revisada_por`, `ia_triagem_revisada_em` e `ia_triagem_acao` como parte da ação do servidor — nunca deixar esses campos nulos em produção após a triagem.
- [ ] **Garantir que `ia_triagem_sugestao` segue o prazo de retenção da manifestação** (10 anos) e é anonimizado junto com o restante do processo ao expirar.

### Avisos de Privacidade (Frontend / App)

- [ ] **[CRITICO] Aviso no formulário de manifestação** (Ouvidoria/ESIC — web e app): texto informando que a manifestação pode ser submetida a triagem por IA, que a triagem é sugestão revisada por servidor, que o texto é enviado a provedor externo (Anthropic, EUA) com garantias contratuais, e como exercer o direito de contestação.
- [ ] **[CRITICO] Opção "Não usar IA para triagem"** visível no formulário de manifestação (parâmetro `sem_ia: true` no payload `POST /manifestacoes`). O backend deve honrar essa opção desviando da chamada ao `IaService`.
- [ ] **Aviso no chat público** antes da primeira mensagem: "Sua pergunta será enviada a um sistema de IA. Não inclua dados pessoais (CPF, nome, endereço) nesta caixa."
- [ ] **Aviso adicional para OCR** (quando feature for ativado): antes do upload de documento, informar que o conteúdo será processado por IA para extração de texto, com as mesmas garantias.

### Retenção e Descarte

- [ ] **Verificar que nenhum consumer do `IaService`** persiste a string de resposta do modelo em tabela de dados sem finalidade declarada e prazo de retenção. A sugestão estruturada (`TriagemSugestao`) pode ser persistida no campo `ia_triagem_sugestao`; o texto bruto de resposta do modelo não deve ser persistido.
- [ ] **Para OCR (quando implementado):** criar tabela `manifestacao_documentos_ocr` com campos `texto_extraido text`, `retencao_expira_em timestamptz` (= `created_at + 10 years`) e incluir no job de expurgo existente para anonimizar `texto_extraido` ao expirar.
- [ ] **Não incluir IP do cliente** no payload enviado ao `AnthropicService`. O IP deve estar apenas no log de acesso HTTP (Nginx/NestJS), não no conteúdo das mensagens ao modelo.

### Auditoria (sem conteúdo pessoal)

- [ ] **Verificar o `auditar()` atual:** confirmar que `dados` nunca inclui o texto da `descricao`, o texto da pergunta do chat, ou a resposta completa do modelo. Os campos `{ prioridade, tipoSugerido }` para triagem e `{ fontes: N }` para chat estão corretos — manter esse padrão.
- [ ] **Para OCR:** o audit_log deve registrar `{ acao: 'IA_OCR', entidadeId: manifestacaoId, dados: { paginas: N, caracteres: N, modelo: string } }` — nunca o texto extraído.
- [ ] **Adicionar ao `audit_log` da triagem** o campo `ia_triagem_acao` após a revisão humana, para rastreabilidade completa: `{ acao: 'IA_TRIAGEM_REVISAO', dados: { acao: 'aceita'|'modificada'|'rejeitada', revisadoPor: userId } }`.

### Contestação e Direitos do Titular

- [ ] **Documentar no aviso de privacidade da Ouvidoria/ESIC** o caminho de contestação: o cidadão insatisfeito com o enquadramento da manifestação pode usar o recurso previsto na LAI (art. 15) e na Lei 13.460/2017 (art. 10), além de encaminhar pedido de explicação sobre uso de IA ao DPO do tenant (contato publicado na Carta de Serviços).
- [ ] **O DPO do tenant deve ser capaz de responder**, a partir dos campos `ia_triagem_sugestao` e `ia_triagem_acao`, quais foram a sugestão da IA e a decisão do servidor humano para a manifestação do cidadão — essa é a explicação mínima exigida pelo art. 20, §1º da LGPD.

---

## Atualização do ROPA — Adendo IA (complementa tabela existente em `docs/06-lgpd-gdpr.md`)

A entrada #6 do ROPA existente é substituída pelas entradas 6a, 6b e 6c da seção 10 deste adendo. As demais entradas (#1 a #5 e #7) permanecem inalteradas.

---

## Controle de Versão deste Documento

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0 | 2026-06-02 | DPO / subagent `lgpd-gdpr-dpo` | Versão inicial — cobre Folha de Pagamento e Denúncias Georreferenciadas |
| 1.1 | 2026-06-03 | DPO / subagent `lgpd-gdpr-dpo` | Adendo Parte III: DPIA do tratamento "IA Assistida" (triagem, RAG, chat, OCR). Adendo Parte IV: checklist técnico para o desenvolvedor do módulo IA. Atualização do ROPA (entradas 6a, 6b, 6c). |

**Próxima revisão obrigatória:** antes do go-live do módulo IA em produção (com DPA assinado); antes de ativar o feature OCR; ou anualmente — o que vier primeiro.

**Referências:**
- LGPD — Lei 13.709/2018
- Guia Orientativo de DPIA — ANPD (2022)
- Nota Técnica ANPD n.º 1/2021 (transferências internacionais)
- Nota de orientação ANPD sobre IA e proteção de dados (2023)
- LC 131/2009 (transparência ativa)
- STF ARE 652.777 (Tema 484, 2015)
- GDPR — Regulamento (UE) 2016/679
- Lei 12.527/2011 (LAI)
- Lei 13.460/2017 (Ouvidoria)
- `docs/06-lgpd-gdpr.md` (bases legais, ROPA, retenção)
- `docs/04-seguranca.md` (modelo de ameaças, RBAC, hardening)
- `api/src/modules/ia/ia.service.ts`, `anthropic.service.ts`, `ia.prompts.ts`, `ia.controller.ts`
- `db/005_app_cidadao_postgis.sql` (schema do módulo Chamados)
- `specs/transparencia.md` e `specs/app-cidadao.md`
