# Prompt — Chat Interno (funcionários) com integração e-SIC

> Cole este prompt no Claude Code / Claude. O arquivo `arquitetura-chat-interno.md` (no mesmo pacote) detalha a arquitetura e a integração com o e-SIC — use-o como referência. **Documente tudo o que for feito.**

---

## Persona

Você atua como **arquiteto de software full-stack**, **especialista em mensageria em tempo real** e **UX**. Conhece WebSockets/escala com Redis, e o contexto de serviços públicos (LAI/e-SIC, LGPD, acessibilidade WCAG 2.1 AA).

## Missão

Construir um **chat interno completo** entre os **funcionários** do município (servidores e gestores), com **integração ao e-SIC**, disponível **no app mobile** e **na plataforma web** — onde, quando o usuário está **logado**, aparece um **ícone de chat flutuante no canto inferior direito**. O chat permite **foto de perfil de cada funcionário** e o envio de **arquivos e fotos**.

## Contexto (plataforma já implantada)

A plataforma já existe: SaaS **multi-tenant**, **Next.js (App Router)** no front, **NestJS** na API, **PostgreSQL + RLS**, **Redis** (filas/cache), **biblioteca de mídia** (uploads restritos, via backend), **roles** internas (ouvidor, secretário, chefe de departamento/unidade, contador, controlador interno, assessor/procurador jurídico, servidor) e os módulos de **Ouvidoria/e-SIC** (com protocolos e tramitação cidadão↔ouvidor). Estenda o que já existe. Respeite:

- **Fronteira de camadas:** front/app falam **só com a API**; quem acessa banco, storage e Redis é o backend.
- **Multi-tenant + RLS:** tudo com `tenant_id`; conversas visíveis só aos **participantes**.
- **Mídia restrita:** avatares e anexos vão à **biblioteca de mídia** como **restritos**, via upload multipart no backend (sem URL pública).
- **Acessibilidade (WCAG 2.1 AA)** e **LGPD** como requisitos de aceite.

> Importante: este é o chat **interno** (backstage entre funcionários). Ele **não** se confunde com o chat de **tramitação cidadão↔ouvidor** já existente. O cidadão **não** tem acesso ao chat interno.

## O que construir

### A) Chat interno (somente funcionários)
- **DMs 1:1**, **grupos/canais** (por secretaria, equipe ou tema) e **conversas vinculadas a protocolo** (e-SIC/ouvidoria).
- Lista de conversas com badge de **não lidas**, busca, e criação de nova conversa escolhendo participantes (apenas usuários internos do tenant).

### B) Integração com o e-SIC
- No **painel do e-SIC**, atalho "**Discutir internamente**" que abre/atrela uma conversa do chat ao **protocolo**, já incluindo os **responsáveis da área detentora** (secretário/chefe/contador/controlador/jurídico, conforme o caso).
- A área responde **internamente** (texto + arquivos); o ouvidor **consolida** e responde ao cidadão **no canal de tramitação do e-SIC** (não aqui).
- Permitir **anexar à resposta oficial** um arquivo trazido no chat (reuso via biblioteca de mídia) com um clique.
- **LAI/LGPD:** a conversa interna é deliberação preparatória e **não** é exposta ao cidadão; só a resposta oficial integra o protocolo. Implemente e documente essa fronteira.

### C) App mobile
- Tela de chat completa: lista de conversas, conversa, envio de texto/arquivos/fotos (galeria e **câmera**), notificações **push**, presença e não lidas.

### D) Web — widget flutuante
- Quando o usuário está **logado**, exibir um **ícone de chat no canto inferior direito** (com badge de não lidas) que abre um **painel de chat** sobre a página atual; também uma **página de chat** dedicada para uso em tela cheia.
- O widget é acessível (teclado, leitor de tela, foco preso no painel quando aberto, ESC para fechar) e não atrapalha a navegação.

### E) Recursos do chat (completo)
- **Foto de perfil por funcionário** (avatar via biblioteca de mídia).
- **Anexos de arquivos e fotos** (via backend; restritos).
- **Presença** (online/ausente), **indicador de "digitando"**, **recibos de leitura**, **@menções**, **busca**, **fixar** mensagem, **editar/excluir** (com auditoria), histórico paginado, e **notificações quando offline**.

### F) Tempo real e escala
- **WebSocket Gateway (NestJS)** com **adaptador Redis** (pub/sub) para funcionar com múltiplas réplicas; **fallback** para polling. Reconciliação de mensagens ao reconectar.

### G) Notificações (reusar o existente)
- Mensagem nova para quem está **offline** → **push** (app) + **e-mail/WhatsApp** (conforme preferências), com link para abrir a conversa. Sem dado sensível desnecessário no corpo; conteúdo completo só dentro da plataforma autenticada.

## Modelo de dados (estender o existente)

`conversas` (tenant, tipo `dm|grupo|protocolo`, título, protocolo_vinculado?, criado_por, criado_em) · `conversa_participantes` (conversa, usuário, papel, último_lido_em) · `mensagens` (conversa, autor, conteúdo, anexos→mídia, respondendo_a?, editado_em?, excluido_em?, criado_em) · `mensagem_leituras` (mensagem/usuário/lido_em) · **avatar** no perfil do usuário (referência à mídia) · presença (cache em Redis). Tudo com **RLS por tenant** e visibilidade **restrita aos participantes**.

## Como trabalhar

1. **Spec** do chat interno + integração e-SIC (comportamento do `arquitetura-chat-interno.md`); confirme o contrato.
2. **Migrations** com RLS (conversas, participantes, mensagens, leituras; avatar no usuário). Teste de isolamento e de visibilidade por participante.
3. **Backend:** REST (conversas, histórico paginado, upload de anexo/avatar) + **WebSocket Gateway** (entrega, digitando, presença, leitura) com adaptador Redis.
4. **Web:** **widget flutuante** (canto inferior direito, logado) + **página de chat**; acessível.
5. **App:** tela de chat com câmera/galeria e push.
6. **Notificações** offline (reuso), **auditoria**, estados de carregando/vazio/erro.

## Critérios de aceite

- Chat interno entre funcionários com **DMs, grupos e conversas por protocolo**; cidadão **sem** acesso.
- **Widget flutuante** no canto inferior direito quando logado (com não lidas) + página de chat; tudo acessível (WCAG AA).
- **App** com chat completo (texto, arquivos, fotos, câmera, push).
- **Foto de perfil** por funcionário e **anexos de arquivos/fotos** funcionando (mídia restrita, via backend).
- **Tempo real** (entrega, digitando, presença, recibos de leitura) escalando com Redis.
- **Integração e-SIC:** abrir conversa interna vinculada ao protocolo, com a área correta; anexar à resposta oficial; deliberação interna **não** exposta ao cidadão.
- RLS + visibilidade por participante, LGPD, auditoria e acessibilidade validados; CI verde.

## Documentação (obrigatória)

Documente **tudo o que foi feito**: spec, ADRs (ex.: WebSocket+Redis x alternativa; fronteira deliberação interna x resposta oficial), **diagramas** (arquitetura, integração e-SIC, sequência de mensagem em tempo real), **modelo de dados**, **contrato de API e eventos WebSocket**, **guia do usuário** (web e app), **README** do módulo e notas de **conformidade/acessibilidade**.

## Fora de escopo (a menos que solicitado)

Chamadas de **voz/vídeo**, chat com o **cidadão** (já existe o canal de tramitação), e federação com mensageiros externos.
