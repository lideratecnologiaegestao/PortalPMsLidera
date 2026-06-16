# 06 — LGPD & GDPR

Conformidade com a **LGPD (Lei 13.709/2018)** e, para titulares na UE, **GDPR**. No setor público, o tratamento se apoia sobretudo em **execução de políticas públicas** e **cumprimento de obrigação legal/regulatória** — o consentimento é exceção.

---

## Bases legais por tratamento (mapa)

| Tratamento | Finalidade | Base legal LGPD | Base GDPR (Art. 6) |
|------------|-----------|-----------------|--------------------|
| Cadastro do cidadão (gov.br) | Identificar para prestar serviço | Execução de política pública (art. 7º, III) | Tarefa de interesse público (6.1.e) |
| ESIC | Cumprir a LAI | Obrigação legal (art. 7º, II) | Obrigação legal (6.1.c) |
| Ouvidoria/denúncia | Apurar e responder | Obrigação legal / interesse público (art. 7º, II e III) | Tarefa de interesse público (6.1.e) |
| Chamados (app) | Atender demanda urbana | Execução de política pública (art. 7º, III) | Tarefa de interesse público (6.1.e) |
| Newsletter/comunicação opcional | Informar | Consentimento (art. 7º, I) | Consentimento (6.1.a) |
| IA (triagem/RAG) | Eficiência no atendimento | Interesse público + revisão humana (art. 7º, III) | Interesse público (6.1.e) |
| Transparência ativa — folha | Cumprir LC 131/2009 + LRF | Obrigação legal (art. 7º, II) | Obrigação legal (6.1.c) |
| CPF de cidadão em `users` | Deduplicação cross-tenant e login gov.br | Execução de política pública (art. 7º, III) | Tarefa de interesse público (6.1.e) |
| CNPJ/CPF de credor em `transp_despesas` | Transparência fiscal obrigatória | Obrigação legal (art. 7º, II) | Obrigação legal (6.1.c) |

---

## Princípios aplicados

- **Minimização:** coletar só o necessário. **Denúncia pode ser anônima** — nunca forçar identificação.
- **Finalidade e adequação:** cada dado tem finalidade declarada; não reaproveitar fora dela.
- **Transparência:** aviso de privacidade por tenant; Carta de Serviços.
- **Segurança:** RLS por tenant, criptografia em trânsito e repouso, log de acesso a dado pessoal, segregação de ambientes.

---

## Direitos do titular

Acesso, correção, eliminação, anonimização, portabilidade, informação sobre compartilhamento e revisão de decisões automatizadas. Implementar:
- Endpoint/processo autenticado para exercício de direitos.
- Prazo de resposta e trilha de atendimento.
- Eliminação/anonimização que respeite prazos legais de guarda (não apagar o que a lei exige reter).

---

## Retenção e eliminação

Cada conjunto de dados tem prazo por finalidade + rotina de eliminação/anonimização. Nada "para sempre". Documentar o prazo na spec do módulo e implementar job de expurgo/anonimização (fila `integracoes`).

| Conjunto | Prazo de retenção | Ação ao expirar |
|----------|-------------------|-----------------|
| `transp_folha` | Enquanto o mandato/exercício vigente + 5 anos (guarda contábil) | Manter dados; sem eliminação — obrigação contínua de transparência |
| `transp_despesas` / `transp_receitas` | Enquanto pertencer ao acervo público | Idem — dados de finanças públicas são permanentes |
| `users` (cidadão) | Até solicitação de exclusão, respeitando prazos de manifestações ativas | Anonimizar: apagar nome/email/cpf, manter id para trilha de auditoria |
| `audit_log` | 5 anos (prazo prescricional geral — CC art. 205) | Arquivo frio; purgar após 5 anos |
| Manifestações (ESIC/Ouvidoria) | 10 anos (portaria CGU) | Anonimizar dados pessoais; manter processo |

---

## ROPA (Registro de Operações de Tratamento)

Manter tabela viva: tratamento · finalidade · base legal · categorias de dados · categorias de titulares · retenção · compartilhamentos · transferências internacionais · medidas de segurança. Atualizar a cada feature que toca dado pessoal (responsável: subagent `lgpd-gdpr-dpo`).

| # | Operação | Categorias de dados | Titulares | Base legal LGPD | Retenção | Compartilhamento | Medidas de segurança |
|---|----------|--------------------|-----------|-----------------|-----------|--------------------|----------------------|
| 1 | Login gov.br / cadastro cidadão | nome, e-mail, CPF (hash), govbr_sub, nível confiabilidade | Cidadãos | Art. 7º, III | Enquanto conta ativa + 5 anos | gov.br (OIDC) | RLS, criptografia em trânsito, hash CPF |
| 2 | Transparência — folha de pagamento | nome_servidor, cargo, vínculo, órgão, remuneração | Servidores públicos | Art. 7º, II | Permanente (acervo público) | Publicação aberta (LC 131) | Sem CPF público; matrícula mascarada na API |
| 3 | Transparência — despesas | credor_nome, credor_doc (CNPJ/CPF) | Credores/fornecedores | Art. 7º, II | Permanente | Publicação aberta | CPF mascarado na API pública |
| 4 | Manifestações ESIC/Ouvidoria | protocolo, conteúdo, dados do requerente | Cidadãos, servidores | Art. 7º, II/III | 10 anos | Órgão respondente do tenant | RLS, audit_log |
| 5 | Chamados app cidadão | geolocalização, descrição, foto | Cidadãos | Art. 7º, III | 2 anos ou encerramento + 1 ano | Secretaria competente | RLS, anonimização opcional |
| 6 | IA (triagem de manifestações) | texto livre de manifestações | Cidadãos | Art. 7º, III + revisão humana | Não persistido além da sessão | API Anthropic (EUA) — ver item transferência int'l | Pseudonimização antes de enviar; sem PII literal |
| 7 | Auditoria (`audit_log`) | ator_id, ação, entidade, IP implícito | Servidores/cidadãos com conta | Art. 7º, II | 5 anos | Nenhum | Append-only; acesso restrito a super_admin |

---

## DPIA / RIPD

Tratamentos de alto risco (IA sobre dados pessoais, monitoramento em larga escala, dados sensíveis) exigem Relatório de Impacto à Proteção de Dados antes do go-live.

Tratamentos que exigem DPIA neste projeto:
- IA sobre conteúdo de manifestações (risco: perfilamento, decisão automatizada).
- Publicação da folha de pagamento com dados individualizados de servidores (risco: exposição indevida).
- Geolocalização contínua no app do cidadão (risco: rastreamento).

---

## Incidentes

Detecção → avaliação de risco → notificação à **ANPD** e aos titulares quando houver risco relevante, em prazo razoável; para GDPR, autoridade competente em até 72h. Registrar o incidente e as medidas.

---

## Decisões automatizadas (IA)

Onde a IA classifica/roteia manifestações, garantir **revisão humana**, explicabilidade mínima e direito de contestação. Documentar base legal e limites do modelo.

---

## Transferência internacional (GDPR)

Se dados de titulares na UE saírem do bloco (ex.: API Anthropic nos EUA), aplicar salvaguardas (cláusulas-padrão/SCCs ou decisão de adequação) e registrar. A API Anthropic possui Data Processing Agreement com SCCs disponíveis — assinar antes de enviar qualquer dado pessoal real.

Para titulares no Brasil usando a API Anthropic: a LGPD exige que a transferência internacional ocorra para países com grau de proteção adequado ou com cláusulas-padrão aprovadas pela ANPD (art. 33 LGPD). Usar anonimização/pseudonimização do texto antes do envio minimiza o risco enquanto a ANPD não publica lista de países adequados definitiva.

---

## Seção: Transparência da folha e documentos

### Fundamento constitucional e jurisprudência

A publicidade da remuneração de servidores públicos é obrigação constitucional pacificada. O STF, no **ARE 652.777 (Tema 484, rel. Min. Teori Zavascki, 2015)**, fixou a tese de que "é legítima a publicação, inclusive em sítio eletrônico mantido pelo poder público, dos nomes dos seus servidores e do valor dos correspondentes vencimentos e vantagens pecuniárias." A ratio é o princípio da publicidade (CF art. 37) e o controle social sobre o erário. O mesmo entendimento foi reafirmado pelo STJ (REsp 1.630.659-RS).

A LGPD, ao tratar do Poder Público em seus arts. 23 a 26, não revoga esse dever de transparência — ao contrário, o art. 23 §1º determina que as hipóteses de tratamento de dados pelo poder público serão informadas em legislação específica, e a LC 131/2009 é exatamente essa legislação para a folha.

**Conclusão jurídica:** nome do servidor, cargo, vínculo, órgão e remuneração (bruta, descontos e líquida) são de publicação obrigatória e legítima. CPF e dados não previstos na LC 131 não têm amparo para publicação — violaria o princípio da minimização (LGPD art. 6º, III) sem base legal específica.

### Tabela de decisão: campos de `transp_folha`

| Coluna | Publicar? | Decisão e fundamento |
|--------|-----------|----------------------|
| `exercicio` | SIM | Período de referência; necessário para controle social. |
| `mes` | SIM | Período de referência; necessário para controle social. |
| `matricula` | MASCARAR | A matrícula identifica o servidor no sistema interno. Não tem amparo de publicação na LC 131 (que exige nome, não número interno). Publicar a matrícula integralmente permitiria cruzamento com outros sistemas e rastreamento indevido. Solução: expor os últimos 4 caracteres precedidos de asteriscos (ex.: `****1234`). Serve para conferência pontual sem ser identificador pleno. |
| `nome_servidor` | SIM | STF ARE 652.777 — nome é publicável. |
| `cargo` | SIM | Necessário para contextualizar remuneração; obrigatório pela LC 131. |
| `vinculo` | SIM | Efetivo/comissionado — relevante para controle; não é dado sensível. |
| `orgao` | SIM | Órgão pagador; necessário para controle social. |
| `remuneracao_bruta` | SIM | STF ARE 652.777 — vencimentos e vantagens são publicáveis. |
| `descontos` | SIM | Necessário para transparência do custo-total; incluso na publicidade. |
| `remuneracao_liquida` | SIM | Incluído explicitamente na tese do STF ("vencimentos e vantagens pecuniárias"). |
| `fonte_origem` | NAO | Dado técnico/operacional interno (nome do sistema contábil). Sem interesse público. Não publicar. |
| `atualizado_em` | NAO | Metadado interno de ETL. Sem interesse público direto. Não publicar. |
| `id` (uuid interno) | NAO | Chave técnica interna; não publicar. Não há risco, mas não agrega ao cidadão. |
| `tenant_id` | NAO | Dado interno de multi-tenancy; jamais expor. |

**Colunas que o endpoint `/api/transparencia/folha` DEVE retornar:**

```
exercicio
mes
matricula_mascarada  (4 últimos chars, ex.: "****1234")
nome_servidor
cargo
vinculo
orgao
remuneracao_bruta
descontos
remuneracao_liquida
```

**Base legal do tratamento:** LGPD art. 7º, II (cumprimento de obrigação legal — LC 131/2009 c/c LRF) e art. 23 (tratamento pelo Poder Público). Finalidade declarada: transparência ativa e controle social sobre despesas de pessoal.

**Nota sobre privacidade reforçada:** servidores afastados por medidas protetivas (violência doméstica, proteção de testemunhas) podem ter o nome suprimido mediante decisão judicial. O backend deve aceitar um campo `nome_suprimido boolean` na tabela (adicionável por migration futura) para suprimir o nome e substituir por "NOME SUPRIMIDO — MEDIDA PROTETIVA", sem alterar os valores financeiros.

---

### Documentos de credores/fornecedores (`credor_doc` e `fornecedor_doc`)

#### Regra de publicação

| Tipo de documento | Regra de exibição na API pública |
|-------------------|----------------------------------|
| CNPJ (14 dígitos) | Publicar integralmente. CNPJ é dado cadastral público (RFB), sem proteção LGPD para pessoa jurídica. |
| CPF (11 dígitos) | **Mascarar.** Credor/fornecedor pessoa física é titular de dados pessoais protegido pela LGPD. A LC 131 exige transparência do credor (nome e valor), não do CPF. |

#### Regra de máscara para CPF de credores/fornecedores

A máscara padrão adotada internacionalmente para CPF em contextos de transparência fiscal (usada pela CGU no Portal da Transparência Federal) é:

```
***.NNN.NNN-**
```

Onde `NNN.NNN` são os dígitos do meio (posições 4 a 9 do CPF, sem formatação). Os 3 primeiros e os 2 dígitos verificadores são ocultados.

**Exemplo:** CPF `123.456.789-09` torna-se `***.456.789-**`

**Implementação (lógica de serviço, não alterar aqui):**
- Detectar se `credor_doc` / `fornecedor_doc` tem 11 dígitos (após strip de pontuação) → CPF → aplicar máscara.
- Se 14 dígitos → CNPJ → publicar na forma formatada `XX.XXX.XXX/XXXX-XX`.
- Se nulo ou formato desconhecido → retornar `null` (não expor dado não validado).

A máscara deve ser aplicada **na camada de serviço do backend**, nunca no frontend (garantia da regra 2b do CLAUDE.md — toda lógica sensível fica no backend). O valor original permanece armazenado para uso interno (notas fiscais, liquidação, auditoria interna).

**Base legal para manter o CPF armazenado internamente:** LGPD art. 7º, II (cumprimento de obrigação legal — LRF, Lei 4.320/1964, controle interno). A minimização se dá na **exposição pública**, não no armazenamento, que tem finalidade legítima.

---

## Seção: CPF de cidadãos em `users`

### Diagnóstico atual

O campo `users.cpf varchar(11)` é gravado **em claro** no momento do upsert do cidadão via gov.br (`auth.service.ts`, linha 38: `cpf: identity.cpf ?? undefined`). Isso cria dois riscos:

1. **Risco de vazamento:** qualquer dump de banco, acesso indevido por operador ou bug de RLS expõe o CPF diretamente. CPF é dado pessoal de alta sensibilidade prática (usado para fraudes, abertura de crédito, cruzamento com Receita Federal).
2. **Risco de correlação cross-tenant:** o mesmo CPF pode existir em múltiplos tenants (mesma pessoa, várias prefeituras). Armazenar em claro cria a possibilidade de correlação não autorizada se houver acesso ao banco com privilégios.

### Análise das opções

| Opção | Prós | Contras | Adequação ao projeto |
|-------|------|---------|----------------------|
| Manter em claro | Simples; permite busca exata | Risco máximo em dump/acesso indevido | Inadequada — item de backlog pendente |
| Hash irreversível (bcrypt/Argon2) | Não reversível; permite verificar se CPF já existe | Não permite recuperar o CPF original para envio a sistemas externos (ex.: validação na Receita) | Inadequada se o CPF precisar ser lido de volta |
| Hash com salt fixo por plataforma (SHA-256 + PEPPER) | Permite deduplicação cross-tenant; mais rápido que bcrypt | Salt/pepper compromisso único — se vazar, força dicionário | Adequada para deduplicação, se não precisar do valor original |
| Criptografia simétrica reversível (AES-256-GCM com chave gerenciada) | Permite ler o CPF original quando necessário (ex.: gov.br, Receita); proteção forte | Gestão de chave; se a chave vazar, os dados também | Adequada quando o valor original é necessário |
| Não armazenar o CPF | Minimização máxima | Perde deduplicação e algumas integrações | Adequada se o `govbr_sub` já é suficiente |

### Recomendação para este projeto

O `govbr_sub` (campo já armazenado, único no gov.br por CPF) já funciona como identificador estável e pseudônimo para o cidadão. Ele não é o CPF, mas o gov.br garante a bijeção. Para deduplicação cross-tenant de um mesmo cidadão, o `govbr_sub` é suficiente e preferível.

**Recomendação: migrar para duas estratégias combinadas.**

**a) Para deduplicação e verificação de identidade:** armazenar um **hash HMAC-SHA-256** do CPF usando um `PEPPER` de plataforma (segredo em variável de ambiente, nunca no banco). Isso permite verificar "este CPF já tem conta?" sem armazenar o CPF em claro, e sem que dois tenants diferentes com acesso ao banco possam cruzar dados (o hash com pepper não é reproduzível sem o segredo).

```
cpf_hash = HMAC-SHA-256(pepper_plataforma, cpf_digits_only)
```

Armazenar como `bytea` ou `text` (hex/base64). Indexável. Substituir a coluna `cpf varchar(11)` por `cpf_hash text`.

**b) Se o CPF original for necessário para alguma integração futura** (ex.: emissão de certidões, validação Receita Federal): armazenar cifrado com **AES-256-GCM**, chave gerenciada externamente (variável de ambiente ou cofre de segredos). A chave nunca entra no banco. O valor original só é decifrado na camada de aplicação quando necessário, e não é retornado em APIs públicas.

**Para este projeto, dado o fluxo atual**, o CPF não é usado após o login (o `govbr_sub` identifica o usuário nas demais operações). A recomendação imediata é:

1. **Não armazenar o CPF em claro.** Substituir pelo hash HMAC-SHA-256 com pepper de plataforma.
2. Se houver necessidade futura de leitura, migrar para AES-256-GCM nesse momento (não antecipar complexidade desnecessária).
3. O campo `govbr_sub` (já existente, `UNIQUE`) permanece como identificador primário do cidadão no sistema.

**Migration necessária:**
- Adicionar coluna `cpf_hash text` em `users`.
- Popular o hash para registros existentes (script one-shot que lê o CPF em claro, gera o hash, grava e apaga o CPF em claro).
- Remover a coluna `cpf varchar(11)`.
- Atualizar `auth.service.ts` para gravar `cpf_hash` no `create` (e não atualizar no `update`, pois o CPF não muda).

**Salt por tenant vs. pepper de plataforma:** salt por tenant impediria deduplicação cross-tenant (que é um requisito implícito do multi-tenancy: o mesmo cidadão em várias prefeituras). O pepper de plataforma (único, global) é o mecanismo correto aqui, pois mantém a capacidade de deduplicação sem expor o CPF em claro.

**Base legal para o CPF em `users`:** LGPD art. 7º, III (execução de política pública — identificação do cidadão para prestação de serviço público digital). Após o login gov.br, o CPF não tem finalidade adicional que justifique sua guarda em claro. O `govbr_sub` cumpre a mesma função com menor risco.

---

## ROPA — Entradas atualizadas nesta revisão

| # | Operação | Categorias de dados | Titulares | Base legal LGPD | Retenção | Compartilhamento | Medidas |
|---|----------|--------------------|-----------|-----------------|-----------|--------------------|---------|
| 2 | Folha de pagamento (pública) | nome, cargo, vínculo, órgão, remuneração, matrícula mascarada | Servidores públicos | Art. 7º, II (LC 131/2009) | Permanente (acervo público) | Publicação aberta controlada | Sem CPF; sem matrícula completa; matrícula últimos 4 dígitos |
| 3 | Despesas com credores PF (pública) | nome do credor, CPF mascarado | Credores pessoa física | Art. 7º, II (LRF) | Permanente | Publicação aberta | CPF mascarado (`***.NNN.NNN-**`) |
| 1b | CPF de cidadão (`users`) | CPF hash (HMAC-SHA-256 + pepper) | Cidadãos | Art. 7º, III | Enquanto conta ativa + 5 anos | Nenhum | Sem valor em claro; pepper em cofre de segredos; acesso restrito por RLS |
| 8 | Solicitações de direitos do titular (`solicitacoes_titular`) | FK para users (titular), descrição livre, resposta, anexo opcional | Cidadãos | Art. 7º, II (obrigação legal — LGPD art. 18) | 5 anos após conclusão (CC art. 205) | Encarregado do tenant; nenhum terceiro | RLS por tenant; RBAC (cidadão vê as suas; staff vê todas); audit_log de ações sem conteúdo |
| 9 | Registro de incidentes de segurança (`incidentes_seguranca`) | Categorias de dados afetados (array), estimativa de titulares, medidas | Cidadãos e servidores afetados | Art. 7º, II (obrigação legal — LGPD art. 48) | 5 anos após encerramento | ANPD (quando obrigatório); nenhum outro | RLS por tenant; RBAC restrito a admin/ouvidor; audit_log; criptografia em repouso e trânsito |
| 10 | Exportação de dados do titular (`GET /api/lgpd/meus-dados`) | Perfil, manifestações, chamados, contatos, alertas, logins — do próprio titular | Cidadãos | Art. 7º, III + Direito de acesso/portabilidade (art. 18) | Não persistido — gerado sob demanda; evento no audit_log por 5 anos | Nenhum — entregue ao titular autenticado | JWT validado; RLS garante escopo; audit_log do evento `TITULAR_DADOS_EXPORTADOS` |
