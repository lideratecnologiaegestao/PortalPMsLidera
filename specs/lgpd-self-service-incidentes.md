# Spec — LGPD Self-Service do Titular e Registro de Incidentes de Segurança

> Contrato para implementação de dois recursos: (1) painel do cidadão para exercício de direitos LGPD
> e (2) registro e gestão de incidentes de segurança pelo Encarregado/DPO.
> Consistente com `docs/06-lgpd-gdpr.md` e `docs/07-dpia.md`.
> Versão: 1.0 — 2026-06-10

---

## 1. Objetivo

### Recurso 1 — Self-service do titular

Permitir que o cidadão autenticado (role `cidadao`) exerça, sem intermediação manual de atendente,
os direitos do art. 18 da LGPD: exportar seus dados (portabilidade/acesso), solicitar correção,
anonimização, eliminação, ou qualquer outro direito listado, e acompanhar o status da solicitação.
A resposta formal é sempre dada pelo Encarregado (DPO) ou gestor designado do tenant.

### Recurso 2 — Registro de incidentes de segurança

Prover ao Encarregado um formulário e fluxo estruturado para registrar, avaliar, conter e comunicar
incidentes de segurança envolvendo dados pessoais, conforme LGPD art. 48 e orientação ANPD (~2 dias
uteis para comunicacao inicial; orientação de prazo razoavel). Para titulares na UE, o prazo GDPR é
72 horas para a autoridade supervisora.

---

## 2. Conformidade legal

| Lei / norma | Dispositivo | Aplicação |
|-------------|-------------|-----------|
| LGPD (Lei 13.709/2018) | Art. 18 | Direitos do titular — base de todo o Recurso 1 |
| LGPD | Art. 19 | Prazo de resposta: 15 dias corridos para acesso/portabilidade |
| LGPD | Art. 20 | Revisão de decisão automatizada (contemplada no tipo `revisao_decisao_automatizada`) |
| LGPD | Art. 41 | Encarregado (DPO) — contato estruturado obrigatório |
| LGPD | Art. 48 | Comunicação de incidentes à ANPD e titulares |
| LGPD | Art. 16 | Hipóteses de guarda obrigatória — fundamenta a vedação ao self-delete imediato |
| GDPR | Art. 6 | Base legal para titulares na UE |
| GDPR | Art. 33 | Notificação de incidente à autoridade em 72 h |
| GDPR | Art. 17 | Direito ao apagamento — sujeito às mesmas exceções de guarda legal |
| LGPD | Art. 7º, II e III | Obrigação legal e execução de política pública — bases primárias no setor público |

---

## 3. Recurso 1 — Self-service do titular

### 3.1 Exportação / portabilidade dos dados (`GET /api/lgpd/meus-dados`)

#### 3.1.1 Endpoint

```
GET /api/lgpd/meus-dados?formato=json
Authorization: Bearer <jwt-cidadao>
Role exigida: cidadao (qualquer usuário autenticado pode exportar os próprios dados)
```

Parâmetro `formato`: aceitar `json` (padrão). O endpoint entrega somente os dados do `sub` do JWT.
Não há acesso a dados de outros titulares — o RLS e o filtro pelo `userId` do JWT garantem isso.

#### 3.1.2 Conjuntos de dados incluídos na exportação

| Conjunto | Fonte | Campos exportados | O que excluir |
|----------|-------|-------------------|---------------|
| Perfil do titular | `users` | `id`, `nome`, `email`, `telefone`, `govbr_nivel`, `ultimo_login_em`, `criado_em` | `senha_hash`, `cpf_hash`, `mfa_secret`, `avatar_storage_key` (substituir por flag booleana `tem_avatar`) |
| Contatos e opt-ins | `user_contatos` | `whatsapp` (mascarado: `****XXXX`), `email`, `email_verificado`, `notif_whatsapp`, `notif_email`, `criado_em` | `whatsapp_codigo`, `email_codigo` (tokens de verificação — nunca exportar) |
| Manifestações do titular | `manifestacoes` WHERE `cidadao_id = userId` | `protocolo`, `canal`, `tipo`, `status`, `assunto`, `descricao`, `criado_em`, `prazo_em`, `resposta` | Dados de outros cidadãos eventualmente presentes em mensagens internas (`interno = true`); dados de terceiros em anexos |
| Mensagens de manifestações | `manifestacao_mensagens` JOIN `manifestacoes` cidadao_id = userId | `autor_tipo`, `conteudo`, `criado_em` | Mensagens com `interno = true` (uso interno do servidor — não pertencem ao titular) |
| Alertas de Diário Oficial | `diario_alertas` WHERE `destino = email do titular` ou vínculo por `tenant_id+user_id` (se houver FK futura) | `termo`, `canal`, `status`, `confirmado_em`, `criado_em` | `token` (token de double opt-in — nunca exportar) |
| Histórico de logins (auditoria do próprio titular) | `audit_log` WHERE `ator_id = userId` AND `acao ILIKE 'LOGIN%'` | `acao`, `criado_em`, `dados->>'ip'` (se presente) | Demais campos de audit_log que referenciem terceiros |
| Chamados (app) | `chamados` WHERE `cidadao_id = userId` | `protocolo`, `categoria`, `status`, `bairro`, `descricao` (se não anonimizada), `criado_em` | `geo` exata (substituir por `bairro` apenas), `storage_key` de fotos (substituir por contagem `fotos_count`) |

#### 3.1.3 O que NÃO incluir

- Dados de terceiros (outros cidadãos, servidores) que apareçam em mensagens, manifestações ou chamados de outros titulares.
- Conteúdo classificado com sigilo (`classificacao_sigilo IS NOT NULL`) — retornar o campo `assunto` mas substituir `descricao` por `[CONTEÚDO SUJEITO A SIGILO]`.
- Tokens e códigos de verificação (`whatsapp_codigo`, `email_codigo`, `token` de alerta de diário).
- Hashes de senha, segredos MFA, chaves de storage.
- `audit_log` de ações de servidores e outros usuários (exportar apenas as entradas onde o `ator_id` é o próprio titular).

#### 3.1.4 Formato de entrega

Retornar `Content-Type: application/json` com estrutura:

```json
{
  "gerado_em": "ISO-8601",
  "titular": { ... },
  "contatos": { ... },
  "manifestacoes": [ ... ],
  "chamados": [ ... ],
  "alertas_diario": [ ... ],
  "historico_logins": [ ... ]
}
```

Não gerar PDF nesta fase. O JSON estruturado cumpre o requisito de portabilidade em "formato interoperável e de uso corrente" (LGPD art. 18, V). O frontend pode renderizar um relatório de leitura humana a partir do JSON se desejado em fase futura — não é requisito desta spec.

#### 3.1.5 Auditoria obrigatória

Registrar no `audit_log`:
```
acao: 'TITULAR_DADOS_EXPORTADOS'
entidade: 'users'
entidade_id: userId
dados: { formato: 'json', conjuntos: ['perfil','manifestacoes',...] }
```

---

### 3.2 Tabela `solicitacoes_titular`

#### 3.2.1 DDL (pronto para migration SQL com RLS)

```sql
CREATE TYPE solicitacao_titular_tipo AS ENUM (
  'confirmacao_existencia',    -- art. 18, I
  'acesso',                    -- art. 18, II
  'correcao',                  -- art. 18, III
  'anonimizacao',              -- art. 18, IV
  'bloqueio',                  -- art. 18, IV
  'eliminacao',                -- art. 18, IV e VI
  'portabilidade',             -- art. 18, V
  'info_compartilhamento',     -- art. 18, VII
  'revogacao_consentimento',   -- art. 18, IX (para tratamentos baseados em consentimento)
  'oposicao',                  -- art. 18, IX (oposição a tratamento sem consentimento)
  'revisao_decisao_automatizada' -- art. 20
);

CREATE TYPE solicitacao_titular_status AS ENUM (
  'aberta',         -- recebida, aguarda triagem do Encarregado
  'em_andamento',   -- Encarregado iniciou análise
  'encaminhada',    -- repassada a outro setor/órgão competente
  'concluida',      -- direito exercido; titular notificado
  'indeferida'      -- com justificativa obrigatória
);

CREATE TABLE solicitacoes_titular (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id),
  titular_id          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- ON DELETE RESTRICT: não apagar o user enquanto houver solicitação em aberto
  tipo                solicitacao_titular_tipo NOT NULL,
  descricao           TEXT,                    -- texto livre do titular (opcional)
  status              solicitacao_titular_status NOT NULL DEFAULT 'aberta',
  prazo_em            TIMESTAMPTZ NOT NULL,    -- calculado na criação (ver 3.2.3)
  atrasada            BOOLEAN     NOT NULL DEFAULT FALSE, -- setado pelo worker de alerta
  resposta            TEXT,                    -- resposta formal do Encarregado
  indeferimento_motivo TEXT,                   -- obrigatório quando status = 'indeferida'
  anexo_storage_key   TEXT,                    -- documento comprobatório (opcional)
  tratado_por         UUID        REFERENCES users(id) ON DELETE SET NULL,
  tratado_em          TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sol_titular_tenant_status ON solicitacoes_titular(tenant_id, status);
CREATE INDEX idx_sol_titular_prazo         ON solicitacoes_titular(prazo_em) WHERE status IN ('aberta','em_andamento');

-- RLS
ALTER TABLE solicitacoes_titular ENABLE ROW LEVEL SECURITY;
-- O cidadão vê apenas as suas próprias solicitações no seu tenant
CREATE POLICY solicitacoes_titular_cidadao ON solicitacoes_titular
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND (
      titular_id = current_setting('app.current_user_id')::uuid   -- cidadão vê as suas
      OR current_setting('app.current_user_role') IN ('admin_prefeitura','ouvidor','gestor')  -- staff interno vê todas do tenant
    )
  );
```

#### 3.2.2 Enum `tipo` — mapeamento com art. 18

| Valor | Art. 18 LGPD | Observação |
|-------|-------------|------------|
| `confirmacao_existencia` | I | "confirmar a existência de tratamento" |
| `acesso` | II | "acessar os dados" |
| `correcao` | III | "corrigir dados incompletos, inexatos ou desatualizados" |
| `anonimizacao` | IV | "anonimizar, bloquear ou eliminar dados desnecessários, excessivos ou tratados em desconformidade" |
| `bloqueio` | IV | idem — quando o pedido é de suspensão de uso, não eliminação |
| `eliminacao` | IV e VI | ver decisao critica na secao 3.4 |
| `portabilidade` | V | "portabilidade dos dados a outro fornecedor" — equivalente ao `GET /api/lgpd/meus-dados` automatizado |
| `info_compartilhamento` | VII | "informação sobre com quem o controlador compartilhou os dados" |
| `revogacao_consentimento` | IX | aplicável apenas para tratamentos em base legal consentimento (ex.: newsletter/opt-ins) |
| `oposicao` | IX | oposição a tratamento com base em outra hipótese legal |
| `revisao_decisao_automatizada` | Art. 20 | revisão humana de triagem por IA |

#### 3.2.3 Prazo legal de resposta e cálculo

A LGPD art. 19 distingue:
- **Resposta imediata e simplificada:** quando a confirmação de existência de tratamento ou o acesso puder ser dado de forma clara e completa de imediato.
- **Declaração completa em até 15 dias corridos:** quando a resposta exigir consultas mais complexas.

Para este sistema, adotar o prazo mais seguro para todos os tipos:

```
prazo_em = criado_em + INTERVAL '15 days'
```

Exceção: para `tipo = 'portabilidade'`, o prazo é igualmente 15 dias (art. 19 não diferencia). O
`GET /api/lgpd/meus-dados` serve como resposta imediata automatizada para `acesso` e `portabilidade`
— o Encarregado pode marcar a solicitação como `concluida` ao verificar que o titular já usou o
endpoint de exportação.

**Alerta de atraso:** Um worker (cron diário, `0 8 * * *`, job `JOB_LGPD_SOLICITACAO_ALERTA` em
`queue.constants.ts`) varre `solicitacoes_titular WHERE status IN ('aberta','em_andamento') AND
prazo_em < NOW() + INTERVAL '2 days' AND atrasada = FALSE`, seta `atrasada = TRUE` e dispara
notificação interna para o Encarregado do tenant.

#### 3.2.4 Maquina de estados

```
aberta
  -> em_andamento   (Encarregado abre para análise)
  -> encaminhada    (repassada a outro setor; prazo não muda)

em_andamento
  -> concluida      (direito exercido; resposta preenchida)
  -> indeferida     (com indeferimento_motivo obrigatório)
  -> encaminhada

encaminhada
  -> em_andamento   (setor devolve ao Encarregado)
  -> concluida
  -> indeferida

concluida / indeferida  -> estado final (sem transição de saída)
```

Transições ilegais devem retornar `422 Unprocessable Entity`.

---

### 3.3 Endpoints do Recurso 1

| Método | Rota | Quem acessa | Descrição |
|--------|------|-------------|-----------|
| `GET` | `/api/lgpd/meus-dados?formato=json` | cidadão autenticado | Exportação/portabilidade |
| `POST` | `/api/lgpd/solicitacoes` | cidadão autenticado | Criar nova solicitação de direito |
| `GET` | `/api/lgpd/solicitacoes` | cidadão autenticado | Listar as próprias solicitações (paginado) |
| `GET` | `/api/lgpd/solicitacoes/:id` | cidadão autenticado | Detalhe da própria solicitação |
| `GET` | `/api/lgpd/admin/solicitacoes` | `admin_prefeitura`, `ouvidor` | Listar todas as solicitações do tenant |
| `GET` | `/api/lgpd/admin/solicitacoes/:id` | `admin_prefeitura`, `ouvidor` | Detalhe completo |
| `PATCH` | `/api/lgpd/admin/solicitacoes/:id` | `admin_prefeitura`, `ouvidor` | Atualizar status, resposta, motivo de indeferimento |
| `GET` | `/api/lgpd/encarregado` | público (sem auth) | Retorna `dpo_nome` e `dpo_email` do tenant |

#### Body `POST /api/lgpd/solicitacoes`

```json
{
  "tipo": "acesso",
  "descricao": "Gostaria de saber quais dados a prefeitura possui sobre mim." // opcional
}
```

Validações: `tipo` deve ser um valor válido do enum; `descricao` máximo 2000 caracteres.

#### Body `PATCH /api/lgpd/admin/solicitacoes/:id`

```json
{
  "status": "concluida",
  "resposta": "Seus dados foram exportados e estão disponíveis no portal.",
  "indeferimento_motivo": null
}
```

Quando `status = 'indeferida'`, `indeferimento_motivo` é obrigatório (validar no DTO).

#### Respostas de erro comuns

| Código | Caso |
|--------|------|
| `403 Forbidden` | Cidadão tentando acessar solicitação de outro titular |
| `422 Unprocessable Entity` | Transição de estado inválida; `indeferida` sem motivo |
| `429 Too Many Requests` | Limite de 5 solicitações abertas simultâneas por titular (evitar flood) |

---

### 3.4 Decisao critica — Eliminacao/exclusao de conta no setor publico

**A eliminacao imediata de conta e fisicamente impossivel e legalmente vedada neste contexto.**

Motivo: o LGPD art. 16 preserva o dado pessoal quando necessário para:
- Cumprimento de obrigação legal (manifestações ESIC/Ouvidoria têm guarda de 10 anos — portaria CGU);
- Exercício regular de direitos em processo judicial ou administrativo;
- Execução de contrato (chamados encerrados mas dentro do prazo de retenção).

**O que a solicitacao `tipo = 'eliminacao'` faz:**

1. A solicitação é registrada em `solicitacoes_titular` e fica `aberta`.
2. O Encarregado analisa quais dados têm fundamento de guarda obrigatória e quais podem ser eliminados.
3. A operação de atendimento é **anonimização do titular**, não exclusão física:

**Operacao "anonimizar_titular(userId)"** — executada pelo Encarregado via endpoint ou script:

```
users:
  nome          -> '[TITULAR ANONIMIZADO]'
  email         -> '<uuid>@anonimizado.invalid'
  telefone      -> NULL
  cpf_hash      -> NULL
  govbr_sub     -> NULL
  govbr_nivel   -> NULL
  avatar_storage_key -> NULL (excluir objeto do storage)
  ativo         -> FALSE
  -- id é preservado para manter integridade referencial

user_contatos:
  whatsapp      -> NULL
  email         -> NULL
  (linha pode ser excluída fisicamente — não tem guarda obrigatória própria)

diario_alertas:
  destino       -> NULL  (ou excluir fisicamente — dado de consentimento revogável)
```

Os registros em `manifestacoes`, `chamados` e `audit_log` que referenciam o `id` do usuário
**permanecem intactos** — o `id` é agora uma referencia "anonima" sem PII vinculada. O mecanismo
de anonimização de `chamados` já previsto no DPIA (`doc/07-dpia.md`, Parte II, checklist) é
executado em paralelo para os chamados desse titular que já venceram os prazos de 90 dias/6 meses.

**Manifestações:** os campos `solicitante_nome`, `solicitante_email` da `manifestacao` são
anonimizados imediatamente quando a manifestação já está `arquivada` ou `encerrada`. Para
manifestações em prazo legal obrigatório (10 anos), os campos identificadores são anonimizados
quando o prazo expirar (job de expurgo existente).

**O que comunicar ao titular na resposta da solicitação:** "Seus dados de identificação foram
removidos do sistema. Registros de processos administrativos são mantidos em forma anonimizada
pelo prazo legal obrigatório, sem possibilidade de vinculação à sua identidade."

**Sem botão de "excluir conta" no self-service:** a tela do cidadão deve criar uma
`solicitacao_titular` do tipo `eliminacao` — nunca executar a anonimização diretamente pelo
endpoint do cidadão. A execução é sempre pelo Encarregado.

---

### 3.5 Campo estruturado do Encarregado (DPO)

**Decisao:** adicionar `dpo_nome` e `dpo_email` diretamente na tabela `tenants`. Não depender de
CMS (slug) para dado estruturado exigido por lei (LGPD art. 41, §1º: o encarregado deve ter
"identidade e informações de contato divulgadas publicamente, de forma clara e objetiva").

**Migration:**

```sql
ALTER TABLE tenants ADD COLUMN dpo_nome  TEXT;
ALTER TABLE tenants ADD COLUMN dpo_email TEXT;
```

**Endpoint publico** `GET /api/lgpd/encarregado` retorna:

```json
{
  "dpo_nome": "Maria da Silva",
  "dpo_email": "dpo@municipio.gov.br"
}
```

Se `dpo_email` for nulo, retornar `dpo_email: null` — o frontend exibe o e-mail genérico de
ouvidoria como fallback. Não bloquear o tenant de operar por falta do campo; registrar no PNTP
como item de conformidade pendente.

**Visibilidade:** exibir o contato do Encarregado na página de Política de Privacidade e no
rodapé do formulário de solicitações de direitos.

---

### 3.6 Acoes de auditoria (audit_log) — Recurso 1

| Acao | Quando registrar | dados (JSON) |
|------|-----------------|--------------|
| `TITULAR_DADOS_EXPORTADOS` | Chamada bem-sucedida ao `GET /api/lgpd/meus-dados` | `{ formato, conjuntos[] }` |
| `SOLICITACAO_TITULAR_CRIADA` | `POST /api/lgpd/solicitacoes` | `{ tipo, solicitacao_id }` |
| `SOLICITACAO_TITULAR_ATUALIZADA` | `PATCH /api/lgpd/admin/solicitacoes/:id` | `{ status_anterior, status_novo, tratado_por }` |
| `TITULAR_ANONIMIZADO` | Execução da operação de anonimização pelo Encarregado | `{ campos_anonimizados[], solicitacao_id }` |

Nunca incluir `descricao` da solicitação ou `resposta` no `audit_log` — dados pessoais têm
controle de acesso próprio na tabela; o log registra eventos, não conteúdo.

---

## 4. Recurso 2 — Registro de incidentes de segurança (LGPD art. 48)

### 4.1 Tabela `incidentes_seguranca`

```sql
CREATE TYPE incidente_categoria AS ENUM (
  'acesso_indevido',      -- acesso nao autorizado a sistemas ou dados
  'vazamento',            -- exposicao de dados a destinatario nao autorizado
  'perda',                -- perda de dispositivo, backup ou acervo
  'ransomware',           -- criptografia maliciosa / extorsao
  'indisponibilidade',    -- interrupcao de servico com impacto em dados
  'erro_humano',          -- envio errado, configuracao equivocada
  'outro'
);

CREATE TYPE incidente_severidade AS ENUM (
  'baixa',    -- sem dado pessoal afetado OU impacto mínimo e reversível
  'media',    -- dado pessoal afetado, risco limitado, sem dado sensivel
  'alta',     -- dado pessoal sensível (art. 11 LGPD) ou volume elevado
  'critica'   -- dado sensivel em larga escala OU risco relevante de dano ao titular
);

CREATE TYPE incidente_status AS ENUM (
  'registrado',     -- incidente documentado, avaliacao pendente
  'em_avaliacao',   -- Encarregado analisando escopo e risco
  'em_contencao',   -- medidas de containment em execucao
  'comunicado',     -- ANPD e/ou titulares comunicados
  'encerrado'       -- pos-incidente concluido, licoes aprendidas documentadas
);

CREATE TABLE incidentes_seguranca (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id),

  -- Identificacao
  titulo                    TEXT        NOT NULL,
  descricao                 TEXT        NOT NULL,
  categoria                 incidente_categoria NOT NULL,
  natureza                  TEXT,        -- texto livre complementar a categoria

  -- Dados afetados
  dados_afetados            TEXT[]      NOT NULL DEFAULT '{}',
  -- valores sugeridos: 'nome','email','cpf','telefone','geo','foto','saude','financeiro','outro'
  titulares_afetados_estimados INT,     -- nulo se desconhecido na fase inicial

  -- Severidade e risco
  severidade                incidente_severidade NOT NULL,
  risco_descricao           TEXT,       -- avaliacao narrativa do risco ao titular
  risco_nivel               TEXT,       -- 'baixo' | 'medio' | 'alto' | 'critico'

  -- Datas
  ocorrido_em               TIMESTAMPTZ,           -- quando o incidente ocorreu (pode ser estimado)
  detectado_em              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prazo_comunicacao_em      TIMESTAMPTZ NOT NULL,  -- calculado na criacao (ver 4.3)
  comunicacao_atrasada      BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Status e fluxo
  status                    incidente_status NOT NULL DEFAULT 'registrado',

  -- Medidas
  medidas_contencao         TEXT,       -- acoes tomadas para conter o incidente
  medidas_mitigacao         TEXT,       -- acoes para mitigar recorrencia

  -- Comunicacao ANPD
  comunicado_anpd           BOOLEAN     NOT NULL DEFAULT FALSE,
  comunicado_anpd_em        TIMESTAMPTZ,
  comunicado_anpd_protocolo TEXT,       -- numero de protocolo ANPD (se houver)

  -- Comunicacao titulares
  comunicado_titulares      BOOLEAN     NOT NULL DEFAULT FALSE,
  comunicado_titulares_em   TIMESTAMPTZ,
  comunicado_titulares_meio TEXT,       -- 'email' | 'portal' | 'imprensa' | 'outro'

  -- Responsavel
  responsavel_id            UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Controle
  criado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidentes_tenant_status   ON incidentes_seguranca(tenant_id, status);
CREATE INDEX idx_incidentes_prazo           ON incidentes_seguranca(prazo_comunicacao_em)
  WHERE status NOT IN ('comunicado','encerrado');
CREATE INDEX idx_incidentes_detectado       ON incidentes_seguranca(tenant_id, detectado_em DESC);

-- RLS: somente staff interno do tenant e super_admin da plataforma
ALTER TABLE incidentes_seguranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY incidentes_seguranca_staff ON incidentes_seguranca
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND current_setting('app.current_user_role') IN
      ('admin_prefeitura','ouvidor','gestor','super_admin')
  );
```

#### 4.1.1 Campo `dados_afetados` — valores canônicos sugeridos

Usar array de texto livre controlado pela UI. Valores sugeridos (multi-select no formulário):

`nome`, `email`, `cpf`, `telefone`, `endereco`, `geolocalização`, `foto`, `dado_saude`,
`dado_financeiro`, `senha_hash`, `govbr_sub`, `historico_manifestacoes`, `outro`

---

### 4.2 Maquina de estados

```
registrado
  -> em_avaliacao     (Encarregado confirma e inicia analise)

em_avaliacao
  -> em_contencao     (acoes de containment iniciadas)
  -> comunicado       (incidente de baixa severidade: diretamente comunicado sem contencao ativa)
  -> encerrado        (incidente avaliado como sem risco relevante — sem obrigacao de comunicar)

em_contencao
  -> comunicado       (pos-containment: prosseguir com comunicacao obrigatoria se aplicavel)
  -> encerrado        (containment encerrou o incidente sem obrigacao de comunicacao)

comunicado
  -> encerrado        (pos-incidente: licoes aprendidas documentadas em medidas_mitigacao)

encerrado -> estado final
```

Transições ilegais retornam `422`.

---

### 4.3 Prazo de comunicacao e calculo

**Regra de negócio:**

```
SE severidade IN ('alta','critica') OU dados_afetados contem dado sensivel (saude, cpf, financeiro)
  prazo_comunicacao_em = detectado_em + INTERVAL '2 days'  -- 2 dias uteis aproximados
SENAO
  prazo_comunicacao_em = detectado_em + INTERVAL '5 days'  -- prazo razoavel para baixa/media
```

**Justificativa:** A LGPD art. 48 nao fixa prazo numerico; a ANPD orienta "prazo razoavel" com
sinalizacao de que incidentes relevantes devem ser comunicados em aproximadamente 2 dias uteis. O
GDPR fixa 72 horas (equivalente a ~3 dias corridos). Para maior segurança e uniformidade, adotar
2 dias corridos para severidade alta/critica (ligeiramente mais conservador que o GDPR/ANPD) e
5 dias para media/baixa.

**Alerta de atraso:**

Worker cron diário `0 7 * * *`, job `JOB_INCIDENTE_ALERTA` em `queue.constants.ts`:

```
SELECT * FROM incidentes_seguranca
WHERE status NOT IN ('comunicado','encerrado')
  AND prazo_comunicacao_em < NOW() + INTERVAL '12 hours'
  AND comunicacao_atrasada = FALSE
```

Para cada resultado: setar `comunicacao_atrasada = TRUE`, registrar no `audit_log` e enviar
notificação interna para `admin_prefeitura` e para o `responsavel_id` do incidente.

**Obrigacao de comunicar:** A obrigação de notificar a ANPD (e eventualmente os titulares) é
acionada quando **todos** os critérios abaixo forem verdadeiros:
1. `severidade IN ('alta','critica')`
2. `dados_afetados` contém ao menos uma categoria de dado pessoal (nao apenas dado tecnico)
3. `titulares_afetados_estimados > 0` (ou desconhecido — presunção de risco)

Para severidade `baixa` e `media`: registrar e avaliar; comunicação à ANPD é discricionária do
Encarregado. O sistema não bloqueia o encerramento sem comunicação nesses casos, mas exige
preenchimento de `medidas_contencao` e `risco_descricao` antes de encerrar.

---

### 4.4 Endpoints do Recurso 2

| Método | Rota | Quem acessa | Descricao |
|--------|------|-------------|-----------|
| `POST` | `/api/lgpd/incidentes` | `admin_prefeitura`, `ouvidor` | Registrar novo incidente |
| `GET` | `/api/lgpd/incidentes` | `admin_prefeitura`, `ouvidor` | Listar incidentes do tenant (paginado, filtros por status/severidade) |
| `GET` | `/api/lgpd/incidentes/:id` | `admin_prefeitura`, `ouvidor` | Detalhe completo |
| `PATCH` | `/api/lgpd/incidentes/:id` | `admin_prefeitura`, `ouvidor` | Atualizar (status, medidas, comunicacao) |
| `GET` | `/api/lgpd/incidentes/:id/relatorio` | `admin_prefeitura`, `ouvidor` | Exportar registro em JSON (prestacao de contas / fiscalizacao) |

Cidadãos **nao** acessam estes endpoints. O cidadão é eventualmente notificado via canal externo
(email, portal, imprensa) quando `comunicado_titulares = TRUE`, mas não via API direta.

#### Body `POST /api/lgpd/incidentes`

```json
{
  "titulo": "Exposição de log com e-mails de cidadãos",
  "descricao": "Arquivo de log acessível publicamente continha endereços de e-mail...",
  "categoria": "acesso_indevido",
  "severidade": "alta",
  "dados_afetados": ["email", "nome"],
  "titulares_afetados_estimados": 340,
  "ocorrido_em": "2026-06-09T14:00:00Z",
  "detectado_em": "2026-06-10T08:00:00Z"
}
```

O `prazo_comunicacao_em` é calculado pelo backend na criação — nunca aceito como input.

#### Relatorio exportavel (`GET /api/lgpd/incidentes/:id/relatorio`)

Retornar `Content-Type: application/json` com todos os campos do registro, incluindo histórico
de status (se houver tabela de eventos futura) e timestamps de cada comunicação. Esse JSON serve
como evidência documental para a ANPD em caso de fiscalização.

```
audit_log ao exportar:
  acao: 'INCIDENTE_RELATORIO_EXPORTADO'
  entidade: 'incidentes_seguranca'
  entidade_id: incidenteId
  dados: { exportado_por: userId }
```

---

### 4.5 Auditoria — Recurso 2

| Acao | Quando |
|------|--------|
| `INCIDENTE_REGISTRADO` | `POST /api/lgpd/incidentes` |
| `INCIDENTE_STATUS_ATUALIZADO` | `PATCH` com mudanca de status |
| `INCIDENTE_COMUNICADO_ANPD` | quando `comunicado_anpd` passa para `TRUE` |
| `INCIDENTE_COMUNICADO_TITULARES` | quando `comunicado_titulares` passa para `TRUE` |
| `INCIDENTE_ALERTA_ATRASO` | worker seta `comunicacao_atrasada = TRUE` |
| `INCIDENTE_RELATORIO_EXPORTADO` | exportacao do relatorio |

---

## 5. Modelo de dados — resumo para migration

Dois novos objetos de banco:

1. `solicitacoes_titular` (Recurso 1) — definido em 3.2.1.
2. `incidentes_seguranca` (Recurso 2) — definido em 4.1.

Alterações em objetos existentes:

| Tabela | Coluna | Tipo | Motivo |
|--------|--------|------|--------|
| `tenants` | `dpo_nome` | `TEXT` | Contato do Encarregado (art. 41 LGPD) |
| `tenants` | `dpo_email` | `TEXT` | Idem |

Nao ha migration necessaria em `users`, `manifestacoes` ou `chamados` para esta spec — os
mecanismos de anonimização já são preexistentes ou estão descritos nos respectivos checklists do
DPIA (`docs/07-dpia.md`).

---

## 6. Bases legais por operacao

| Operacao | Base legal LGPD | Base GDPR (art. 6) | Observação |
|----------|-----------------|--------------------|------------|
| Exportacao de dados do titular | Art. 7º, III (politica publica) + Art. 18, II e V | 6.1(e) tarefa de interesse publico | O acesso/portabilidade e um direito do titular; a base legal do tratamento original nao muda |
| Solicitacao de direitos — registro | Art. 7º, II (obrigacao legal — art. 18 LGPD exige que o controlador atenda) | 6.1(c) obrigacao legal | A solicitacao é dado pessoal tratado por obrigacao legal |
| Anonimizacao do titular | Art. 7º, II (obrigacao legal — art. 18, IV) + Art. 16 (limite: guarda obrigatoria) | 6.1(c) + art. 17 GDPR | Dado residual retido so pelo minimo legal |
| Registro de incidente | Art. 7º, II (obrigacao legal — LGPD art. 48) | 6.1(c) + GDPR art. 33 | Tratar dado do incidente é obrigacao legal |
| Comunicacao de incidente à ANPD | Art. 48 LGPD | GDPR art. 33 | Obrigacao legal |
| Comunicacao de incidente aos titulares | Art. 48, §1º LGPD | GDPR art. 34 | Obrigacao legal quando risco elevado |
| Notificacao interna de prazo de solicitacao | Art. 7º, II (obrigacao legal de atender no prazo) | 6.1(c) | Notificacao interna ao DPO |

---

## 7. Atualizacao do ROPA

Adicionar as seguintes entradas ao ROPA em `docs/06-lgpd-gdpr.md`:

| # | Operacao | Categorias de dados | Titulares | Base legal LGPD | Retencao | Compartilhamento | Medidas de seguranca |
|---|----------|--------------------|-----------|-----------------|-----------|--------------------|----------------------|
| 8 | Solicitacoes de direitos do titular (`solicitacoes_titular`) | nome implicito via FK, descricao livre, resposta, anexo | Cidadaos | Art. 7º, II (obrigacao legal — LGPD art. 18) | 5 anos apos conclusao (prazo prescricional CC art. 205) | Encarregado do tenant; nenhum terceiro | RLS por tenant; RBAC (cidadao ve somente as suas; staff do tenant ve todas); audit_log de acoes |
| 9 | Registro de incidentes de seguranca (`incidentes_seguranca`) | categorias de dados pessoais afetados (array), estimativa de titulares | Cidadaos e servidores afetados pelo incidente | Art. 7º, II (obrigacao legal — LGPD art. 48) | 5 anos apos encerramento | ANPD (comunicacao obrigatoria quando aplicavel); nenhum outro | RLS por tenant; RBAC restrito a admin/ouvidor; audit_log; criptografia em repouso e transito |
| 10 | Exportacao de dados pessoais do titular (`GET /api/lgpd/meus-dados`) | todos os conjuntos listados em 3.1.2 | Cidadaos | Art. 7º, III + Direito de acesso/portabilidade art. 18 | Nao persistido — gerado sob demanda; o audit_log registra o evento por 5 anos | Nenhum — entregue diretamente ao titular autenticado | JWT validado; RLS garante escopo; audit_log do evento |

---

## 8. Requisitos nao-funcionais

- **RLS obrigatório:** `solicitacoes_titular` e `incidentes_seguranca` com policies conforme 3.2.1 e 4.1. Nenhuma query acessa essas tabelas fora do `PrismaService` com `current_tenant_id` setado.
- **Criptografia em transito:** HTTPS obrigatório (já garantido pela infra). O campo `descricao` da solicitacao e o relatorio do incidente nao saem em claro.
- **Sem dado pessoal no audit_log:** `dados` do audit_log nunca inclui `descricao` da solicitacao, `resposta`, ou conteúdo narrativo do incidente.
- **Limite de taxa:** `POST /api/lgpd/solicitacoes` limitado a 5 solicitacoes abertas simultaneas por titular (retornar `429` ao exceder); `GET /api/lgpd/meus-dados` limitado a 3 exportacoes por hora por titular.
- **Performance da exportacao:** o `GET /api/lgpd/meus-dados` deve responder em menos de 5 segundos para o percentil 95. Usar queries com índices já existentes em `tenant_id + cidadao_id`. Se necessário, processar assincronamente e notificar por e-mail (fase 2).

---

## 9. Criterios de aceite

- [ ] `GET /api/lgpd/meus-dados` retorna exatamente os conjuntos definidos em 3.1.2, sem vazar dados de outros titulares (teste de RLS: JWT de cidadao A nao retorna dados do cidadao B).
- [ ] Cidadao B nao consegue acessar `GET /api/lgpd/solicitacoes/:id` de solicitacao do cidadao A (403).
- [ ] `POST /api/lgpd/solicitacoes` com tipo invalido retorna 422.
- [ ] Worker de alerta seta `atrasada = TRUE` 48h antes do prazo e registra no `audit_log`.
- [ ] Anonimizacao do titular: `users.nome`, `email`, `cpf_hash`, `telefone` sao substituidos; `id` e FK nas demais tabelas permanecem; teste de integridade referencial nao falha.
- [ ] `incidentes_seguranca` com `severidade = 'critica'` tem `prazo_comunicacao_em = detectado_em + 2 days`.
- [ ] Transicao de status invalida (ex.: `encerrado -> registrado`) retorna 422.
- [ ] `GET /api/lgpd/encarregado` retorna `dpo_nome` e `dpo_email` do tenant sem autenticacao.
- [ ] `GET /api/lgpd/incidentes` nao e acessivel por cidadao (403); `admin_prefeitura` do tenant A nao ve incidentes do tenant B.
- [ ] Todos os endpoints sensíveis registram a acao correta no `audit_log` sem incluir conteudo pessoal.
- [ ] Teste de isolamento RLS incluido na suite de integracao.

---

## 10. Fora de escopo (desta entrega)

- Versao PDF da exportacao de dados (fase 2).
- Processamento assincrono (fila BullMQ) para exportacoes de grandes volumes de dados.
- Notificacao automatica ao titular por e-mail/WhatsApp apos mudanca de status da solicitacao (fase 2 — integrar com `notificacoes.service.ts` existente).
- Interface de busca full-text em incidentes.
- Integracao com portal externo da ANPD para envio eletronico de comunicacao de incidente.
- DPIA especifico para estes dois recursos (o risco e baixo: base legal e obrigacao legal, sem tratamento de alto risco adicional; os mecanismos de seguranca ja cobrem o escopo).
- Exportacao de dados de servidores (nao cidadaos) — requer spec separada com autorizacao de RH.
