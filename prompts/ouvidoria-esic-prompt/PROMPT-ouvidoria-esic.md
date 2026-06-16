# Prompt — Canal Cidadão ↔ Ouvidor: Ouvidoria + e-SIC

> Cole este prompt no Claude Code / Claude. O arquivo `fluxo-ouvidoria-esic.md` (no mesmo pacote) descreve o funcionamento completo dos dois canais — use-o como especificação de comportamento. **Documente tudo o que for feito.**

---

## Persona

Você atua como **arquiteto de software full-stack**, **especialista em Ouvidoria pública e Lei de Acesso à Informação (LAI)** e **UX de serviços públicos**. Conhece a Lei 13.460/2017 (Ouvidoria), a Lei 12.527/2011 + Decreto 7.724/2012 (LAI/e-SIC), prazos, recursos, sigilo, LGPD e acessibilidade (WCAG 2.1 AA).

## Missão

Construir, no nosso portal, um **canal exclusivo cidadão ↔ ouvidor** com todo o fluxo de tramitação, cobrindo **Ouvidoria** e **e-SIC**, em web e app, com chat de tramitação, protocolos, painéis do cidadão e do ouvidor, prazos legais e notificações. Ao final, **documente todo o trabalho**.

## Contexto (plataforma já implantada)

A plataforma já existe: SaaS **multi-tenant**, **Next.js (App Router)** no front, **NestJS** na API, **PostgreSQL + RLS**, filas (BullMQ/Redis), **biblioteca de mídia** (uploads do cidadão são restritos e passam pelo backend), **roles** (incluindo `cidadao` e `ouvidor`) e um módulo de manifestações com **máquina de estados** e **SLA**. Estenda e complete esses módulos — **não** reinvente o que já existe. Respeite as regras:

- **Fronteira de camadas:** front/app falam **só com a API**; quem acessa banco, storage e serviços externos é o backend.
- **Multi-tenant + RLS:** toda tabela com `tenant_id` e isolamento por prefeitura.
- **Mídia restrita:** fotos/anexos do cidadão vão à biblioteca de mídia como **restritos** (sem URL pública), via upload multipart no backend.
- **Acessibilidade (WCAG 2.1 AA)** e **LGPD** como requisitos de aceite.

## O que construir

### A) Cidadão — abertura (web e app)
- **Ouvidoria:** formulário por **tipo** — reclamação, denúncia, crítica, sugestão, elogio, solicitação. Opção **anônima** (especialmente denúncia).
- **Demandas urbanas (web e app):** categorias **terreno baldio, foco de dengue, buraco na via, barulho/perturbação, iluminação, lixo/entulho, animal abandonado, poda de árvore, outros** (configuráveis por prefeitura), com **envio de foto** e **localização geográfica (GPS/mapa)**.
- **e-SIC:** pedido de informação **somente para cidadão logado** (LAI exige identificação).
- Em todos os casos, ao registrar, o sistema **gera um número de protocolo** e confirma ao cidadão. Para anônimo, exiba o protocolo (e uma **chave de acompanhamento** para evitar que terceiros leiam pelo protocolo adivinhado — justifique a escolha).

### B) Acompanhamento
- **Anônimo:** tela pública de acompanhamento por **protocolo** (+ chave) → mostra status, prazos e a tramitação.
- **Logado:** **Painel do Cidadão** com "Minhas manifestações" e "Meus pedidos e-SIC", status, protocolos e acesso ao chat de cada um.

### C) Tela de tramitação em **chat contínuo**
- Thread única por manifestação/pedido: cada mensagem com **autor** (cidadão / ouvidor / sistema), **data e hora**, texto e **anexos** (via biblioteca de mídia restrita).
- Os **eventos de status** (encaminhada, prorrogada, respondida, concluída…) aparecem intercalados como marcos na mesma linha do tempo.
- Atualização em tempo real (websocket) ou por polling; estados de carregando/vazio/erro.

### D) Painel do Ouvidor (após login, reconhecido pela role)
- O sistema reconhece a role `ouvidor` e libera no menu o **Painel do Ouvidor**.
- **Caixa de entrada/fila** com filtros (tipo, status, prazo, secretaria, canal ouvidoria/e-SIC), busca e ordenação por urgência de prazo.
- Ações: triar, **encaminhar à secretaria** (tramitação interna), pedir complemento (**pausa SLA**), **responder** ao cidadão (chat), **prorrogar** (justificado), **indeferir** (e-SIC, fundamentado), **concluir**; abrir/julgar **recursos** (e-SIC); para Ouvidoria, disparar **pesquisa de satisfação**.
- No **e-SIC**, o ouvidor/SIC **busca a informação** com as secretarias detentoras e repassa ao cidadão.

### E) Prazos / SLA
- **Ouvidoria 30+30**, **e-SIC 20+10**, **recurso e-SIC** em 5 dias (configurável por prefeitura; dias úteis/corridos + feriados).
- Agendar **alerta** (~80% do prazo) e **vencimento**; **pausar** quando aguardando cidadão e **recalcular** na retomada; **prorrogação** estende o prazo. Destaque visual de vencidos no painel.

### F) Cadastro de contatos e notificações multicanal (WhatsApp + e-mail)
- **Cadastro e verificação de contatos:** todo **cidadão logado** e todo **usuário interno** cadastra **número de WhatsApp** e **e-mail**, com **verificação** (código único) e **preferências/opt-in**. Internos abrangem: **ouvidor, secretário(a), chefe de departamento/unidade, contador(a), controlador(a) interno(a), assessor(a)/procurador(a) jurídico(a)**.
- **Disparo a cada nova requisição/tramitação:** o sistema notifica **quem deve agir** por **WhatsApp** (via **Evolution API** já existente) **e e-mail**, com um **link seguro para entrar na plataforma e responder**:
  - nova manifestação/pedido → **ouvidor**;
  - encaminhada a uma área → **responsável da área** (secretário/chefe/contador/controlador/procurador);
  - cidadão respondeu/complementou → **ouvidor** (e a área, se aberta);
  - ouvidor/área respondeu → **cidadão logado**;
  - prazo em ~80%/vencido → **ouvidor + responsável da área**;
  - recurso (e-SIC) → **autoridade superior**; conclusão/satisfação → **cidadão**.
- **Conteúdo seguro (LGPD):** a mensagem **não** contém o teor nem dados pessoais — apenas **protocolo**, a ação esperada ("você tem uma nova tramitação para responder") e o **link** de login. O conteúdo só é visto dentro da plataforma, autenticado.
- **Robustez:** envio assíncrono pela **fila** (BullMQ) com **retry**, **fallback** para e-mail se o WhatsApp falhar, respeito ao **opt-out**, e **push** no app. Anônimo só recebe se informou um canal.

### F2) Roteamento por área
Cada manifestação encaminhada a uma área resolve o(s) **responsável(is)** daquela área (secretário e/ou chefe de unidade, e os papéis de apoio quando envolvidos — contador, controlador, jurídico) para destinar a notificação e a tarefa no painel correspondente.

### G) Relatórios e conformidade
- Relatórios estatísticos (volume, prazo médio, taxa de resposta, por tipo/secretaria) para a **Lei 13.460** (relatório de ouvidoria) e a **LAI** (relatório de pedidos de acesso) e para alimentar o **PNTP**.
- LGPD: anonimato real, minimização, mídia restrita, log de acesso, retenção; **auditoria** de todas as transições e acessos a dado restrito.

## Modelo de dados (estender o existente)

Manifestação/pedido (tenant, protocolo, canal `ouvidoria|esic`, tipo, status, anônima, cidadão, secretaria, prazos, geo para demandas urbanas) · **mensagens da tramitação** (autor_tipo, autor_id, conteúdo, criado_em, anexos→mídia) · **eventos** (transições imutáveis) · **anexos** (via biblioteca de mídia, restritos) · pesquisa de satisfação · recursos (e-SIC). Tudo com **RLS por tenant**; demandas urbanas com **PostGIS** (ponto + duplicado por raio).

**Contatos e notificações:** no perfil do usuário, **whatsapp** e **e-mail** com flags de **verificado** e **preferências de notificação** (por canal/evento); vínculo **área → responsáveis** (quais usuários respondem por cada secretaria/departamento/unidade e os papéis de apoio: contador, controlador, jurídico); **log de notificações** (destinatário, evento, canal, status de envio, provedor/ID da mensagem) para auditoria e reenvio. Nada de dado pessoal/sigiloso no corpo da notificação.

## Como trabalhar

1. Escreva a **spec** do canal (comportamento do `fluxo-ouvidoria-esic.md`) e confirme o contrato.
2. Banco: migrations com RLS (mensagens, recursos, satisfação, ajustes na manifestação). Teste de isolamento.
3. Backend (NestJS): endpoints de abertura (web/app), protocolo, acompanhamento (anônimo e logado), chat (enviar/listar mensagens + anexos), ações do ouvidor (transições/encaminhamento/recursos), SLA (filas), notificações.
4. Frontend (Next.js): portal de Ouvidoria, fluxo de e-SIC, tela de acompanhamento por protocolo, **Painel do Cidadão**, **Painel do Ouvidor** e a **tela de chat de tramitação**. App: abertura de demanda urbana com foto + GPS.
5. Acessibilidade (WCAG AA), LGPD e auditoria cobertas por teste; estados de carregando/vazio/erro.

## Critérios de aceite

- Cidadão abre ouvidoria (inclusive **anônima**) e e-SIC (**logado**); cada registro gera **protocolo**.
- Anônimo acompanha por **protocolo** (+ chave); logado acompanha pelo **painel**.
- **Chat de tramitação** funcionando com autor, data/hora, anexos e marcos de status.
- **Contatos (WhatsApp + e-mail) cadastrados e verificados** para cidadão logado e internos (ouvidor, secretário, chefe de unidade, contador, controlador, jurídico); a cada nova requisição/tramitação o **responsável correto** recebe **WhatsApp + e-mail** com link para entrar e responder; conteúdo sem dado sensível; opt-out e fallback respeitados.
- Ouvidor é reconhecido pela role e acessa o **Painel do Ouvidor**, respondendo e tramitando; no e-SIC, busca a informação e repassa.
- Demandas urbanas (app/web) com **foto + geolocalização** e detecção de duplicado por raio; mídia **restrita**.
- Prazos (30+30 / 20+10), pausa/retoma, prorrogação e **recursos** (e-SIC) corretos; alertas e vencimentos.
- RLS, LGPD, acessibilidade e auditoria validados; CI verde.

## Documentação (obrigatória — entregar junto)

Ao final, **documente tudo o que foi feito**:
- **Spec** do canal e **ADRs** das decisões relevantes (ex.: chave de acompanhamento do anônimo, tempo real x polling).
- **Diagramas** (fluxos, máquina de estados, sequência do chat, e-SIC com recursos, SLA) — pode partir do `fluxo-ouvidoria-esic.md`.
- **Modelo de dados** (tabelas, RLS, relações) e **contrato de API** (endpoints, payloads, erros).
- **Guia do Ouvidor** e **Guia do Cidadão** (como usar cada painel).
- **README** do módulo (como rodar/testar) e **changelog**.
- Notas de **conformidade** (Lei 13.460, LAI, LGPD, PNTP) e de **acessibilidade**.

## Fora de escopo (a menos que solicitado)

Integração com sistemas externos de ouvidoria federais (Fala.BR/e-SIC nacional), BI avançado e assinatura digital — podem ser fases posteriores.
