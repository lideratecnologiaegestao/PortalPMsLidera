# Prompt — Ler o TR de Barão de Melgaço e levar o portal a 100% de aderência

> Cole no **Claude Code** dentro do repositório `D:\Site\portal-prefeitura`. Use junto com `checklist-requisitos-tr.md` (mesmo pacote) como rastreador de cobertura. **Não recomece nada do zero** — estenda o que já existe. **Documente tudo.**

---

## Persona

Você é o **arquiteto técnico do portal** (NestJS 10 + Next.js 14 App Router + PostgreSQL 16 + PostGIS + Prisma + BullMQ/Redis 7 + Docker), especialista em **portais públicos, transparência (LAI/TCE-MT/ATRICON/PNTP), Ouvidoria/e-SIC (Lei 13.460), Carta de Serviços, LGPD e acessibilidade (WCAG 2.1 AA / eMAG)**, e em **licitações (Lei 14.133/2021)**.

## Tarefa

1. **Ler integralmente** o Termo de Referência em `D:\Site\portal-prefeitura\prompts\trbarao.rtf` (Prefeitura de **Barão de Melgaço/MT** — plataforma integrada de Portal, Governo Digital, Transparência, SIC, Ouvidoria, Carta de Serviços, Webmail e Chatbot).
2. **Fazer o gap analysis** entre o TR e o **código atual** do portal.
3. **Implementar tudo o que falta** para atingir **100% dos requisitos de software**, **sem quebrar as regras invioláveis** do portal e **reutilizando** os módulos existentes (Ouvidoria/e-SIC, biblioteca de mídia, cadastro de documentos, Carta de Serviços, CMS, app do cidadão).
4. **Sinalizar com honestidade** os itens que **não são código** e entregá-los como **plano/integração** (ver "Itens que não se resolvem só com código").
5. Produzir a **Matriz de Aderência** rastreável e atualizar a documentação.

### Como ler o RTF (robustez)

`pandoc` não lê `.doc`, e o `extract-text` pode falhar com RTF que tem imagens embutidas. Ordem sugerida: tentar `unrtf --text`, senão `libreoffice --headless --convert-to txt:"Text" trbarao.rtf`, senão um *strip* em Python (regex) descartando blobs de imagem (linhas longas/hex). **Leia o corpo inteiro, inclusive tabelas; ignore as imagens.** Não confie em apenas um trecho.

## Regras invioláveis do portal (não violar para "fechar requisito")

- **Multi-tenant com RLS no banco** (sessão seta `app.current_tenant_id` por transação via `prisma.db`; cross-tenant só por `prisma.platform()`). Toda tabela nova entra no RLS. Lembrar: **superusuário Postgres ignora RLS** → usar roles `portal_app` (NOSUPERUSER NOBYPASSRLS) e `portal_ro`.
- **Duas camadas de autorização:** RBAC (`@Roles` + `RolesGuard`) **e** RLS.
- **Fronteira de camadas:** front/app falam **somente com a API**; nunca acessam banco/storage/filas direto. **Upload sempre via API multipart.**
- **Mídia do cidadão = restrita** (sem URL pública), pela biblioteca de mídia.
- **WCAG 2.1 AA / eMAG** bloqueante; **prazos legais** (e-SIC 20+10 LAI; Ouvidoria 30+30 Lei 13.460); **LGPD**; **auditoria** (`audit_log`); **filas Redis idempotentes** (REDIS_DB/BULLMQ_PREFIX já reservados para não colidir com a Evolution).

## Escopo de implementação (o que precisa existir ao final)

Trate cada bloco abaixo como meta de aderência; detalhe está no `checklist-requisitos-tr.md`.

- **Gestão de usuários/grupos/permissões:** CRUD, grupos com permissões granulares, níveis de acesso ao backend, **sessões ativas/usuários online**, relatórios de usuários/atividades, **política de senha forte + expiração**, monitoramento de tentativas de login e atividades suspeitas. (Aproveitar RBAC + `audit_log`.)
- **SEO:** **URLs amigáveis sem ID** (slugs — já temos taxonomias com slug), meta tags por página, **sitemap XML automático**, Google Analytics, **Open Graph**, **cache** de páginas/conteúdo. (Next.js cobre a maior parte.)
- **Segurança/Firewall/WAF:** HTTPS/SSL/TLS, **proteção anti-brute-force (rate-limit + bloqueio temporário de IP)**, anti-SQLi/XSS, **logs de auditoria**, **modo manutenção**, **bloqueio por IP/país** (camada de borda — Cloudflare/WAF; documentar config), notificações de segurança, verificação de integridade. Separar claramente o que é app x borda.
- **Notícias/Galerias:** notícias com mídia, **galeria de fotos**, **áudio (streaming/host)**, **vídeo (YouTube/host)**, metadados/SEO, datas (publicação/modificação/encerramento), nível de acesso, autor/fonte/capa/legenda/crédito, caixa de HTML. (CMS + biblioteca de mídia.)
- **SIC – documentos:** upload DOC/DOCX/ODT/PDF/XLS/XLSX/ZIP, **bloqueio de extensões perigosas**, **categorias hierárquicas** e por nível de acesso, datas, metadados, **escaneamento/indexação full-text do conteúdo do arquivo** (extração via Tika/poppler/antiword + busca FTS no Postgres ou OpenSearch), filtros na área administrativa. (Reaproveitar o cadastro de documentos já feito.)
- **Banners e Popups:** publicação com título, datas início/fim, estado, link, HTML/preview; **popups** com imagem/vídeo (YouTube/Vimeo/redes), links, visibilidade, estilos, exibição por página, intervalo de tempo.
- **Ouvidoria:** manifestação completa, **criação automática de login por ticket** (ou acompanhamento por protocolo+chave, mantendo anonimato), **notificação ao ouvidor** (e-mail) e ao responsável, filtros avançados, **histórico**, **gráficos dinâmicos por período exportáveis (imagem e CSV)**, **pesquisa de satisfação com export PDF/Excel**, **relatórios TCE-MT (PDF/DOCX)**, acessibilidade. (Estender o módulo de ouvidoria — protocolo/FSM/SLA/timeline/notificações WhatsApp+e-mail já existem.)
- **Formulários:** **construtor visual (arrastar-e-soltar)**, vários tipos de campo, validação (obrigatório, formato e-mail/telefone/CPF, comprimento, custom), **CAPTCHA/anti-spam**, gerenciamento/filtragem de envios, **export Excel/XML/CSV**, permissões de acesso, mensagem de confirmação, **notificações por e-mail (com anexos, CC/BCC)**, armazenamento seguro.
- **Páginas (CMS):** **construtor arrastar-e-soltar**, responsivo, **templates aprovados pelo órgão**, elementos prontos (botões, sliders, galerias, tabelas), SEO por página, **HTML/CSS/JS custom**, animações, **conteúdo dinâmico/feeds sociais**, backup/restauração de páginas.
- **LGPD:** aviso/política de privacidade, **consentimento explícito ativo**, **direitos do titular** (acesso/retificação/exclusão/portabilidade), criptografia, **privacy by design** (minimização, pseudonimização/anonimização), **auditorias/relatórios de conformidade**, comunicação de incidentes.
- **Carta de Serviços (Lei 13.460):** serviços por categoria **Cidadão/Empresa/Servidor**, **avaliação por estrelas**, **lista dos mais avaliados**, **pesquisa de satisfação**, layout responsivo/acessível (WCAG), busca/filtros, gestão dos serviços, **notificação e acompanhamento de status**.
- **Governo Digital:** solicitação 100% online, **login automático por solicitação** (ou anônimo), **recuperação de protocolo por e-mail (lista por e-mail)**, **notificação ao responsável**, **acompanhar protocolo e enviar mensagem SEM login (pela home)**, **separação por departamento** (admin vê só o seu), gráficos por período exportáveis, satisfação com export, acessibilidade.
- **Chatbot omnichannel + atendimento humano (lacuna grande):** **console administrativo** (caixa de entrada centralizada, **notificação por áudio em tempo real**, departamentos, tags, **transcrição (.txt)**, mídias/emojis, **transferência para atendente humano**, **notas internas**, **verificação de horário de atendimento**), **widget 24h** visível no Portal/Governo Digital/Ouvidoria/Carta de Serviços/SIC, integração com o banco (consultar protocolos/solicitações), histórico de atendimentos, ativação automática do bot após o humano. Tempo real via **WebSocket Gateway + Redis**; WhatsApp via **Evolution API**. (Distinto do chat interno entre funcionários — **não reutilizar como se fosse a mesma coisa**.)
- **Webmail (não é só código — ver abaixo).**
- **Transparência/PNTP:** garantir que o módulo de Transparência cobre os itens de **TCE-MT/ATRICON/LAI** (publicações, RGF/RREO já fora do cadastro genérico, relatórios). A **assessoria/consultoria PNTP** é serviço (ver abaixo).

## Itens que NÃO se resolvem só com código (entregar como plano/integração, com honestidade)

- **Webmail institucional (100 contas, 20 GB/conta, backup semanal/retenção 30 dias, SSL/TLS, IMAP/SMTP, webmail + app):** o **servidor de e-mail é infraestrutura**, não código do portal. Entregue um **ADR de make-or-buy** (ex.: **Mailcow/Mailu/Zimbra** self-hosted vs. provedor gerenciado) e **implemente a integração/administração** no portal: provisionamento de contas/quota, configuração IMAP/SMTP, acesso ao webmail e **política de backup/retenção**. O portal "atende" **integrando e administrando** — deixe explícito o que é do servidor de e-mail.
- **Assessoria/Consultoria PNTP (RADAR, mapeamento normativo, trilha de capacitação, coleta/validação de dados, relatório mensal):** é **serviço recorrente com pessoas + metodologia**. Entregue um **documento de oferta de assessoria** (escopo, fluxo, papéis, modelo de relatório mensal) e os **artefatos no sistema** que dão suporte (módulo/checklist de transparência, relatórios). Não finja que código sozinho cumpre isso.
- **Habilitação (graduação em ADS, empresa ≥ 3 anos, atestado ATRICON/PNTP por LAI 12.527) e hospedagem:** **fora do código.** Apenas **registre como pendências de habilitação/operacional** na matriz (o atestado ATRICON costuma ser o ponto mais sensível). A hospedagem o portal já cobre (infra própria) — dimensione SLA/backup/continuidade por município.

## Como trabalhar

1. **Ler o TR** e **gerar a Matriz de Aderência** inicial (cada requisito → status atual: Atende / Parcial / Não atende / Não-software), referenciando arquivo/endpoint/tela quando já existir.
2. Para cada **Parcial/Não atende** de software: criar **spec curta**, **migração** (com RLS), **módulo/endpoints (NestJS)** e **telas (Next.js)**, **estados de carregando/vazio/erro** e **acessibilidade**.
3. **Filas idempotentes** para notificações/relatórios/escaneamento (BullMQ), respeitando os prefixos reservados.
4. **Testes**: unit/e2e por módulo + **testes negativos obrigatórios** (mídia restrita não vaza; isolamento por tenant com RLS; RBAC).
5. **Reexecutar a matriz** ao final e provar que **100% dos itens de software** estão "Atende", com cada um apontando para a implementação.

## Critérios de aceite

- **Matriz de Aderência** completa, com **100% dos requisitos de software** marcados "Atende" e rastreados para código/tela/endpoint; itens não-software claramente marcados com seu plano/integração.
- Módulos novos respeitam **RLS multi-tenant**, **camadas (só API)**, **mídia restrita**, **LGPD**, **WCAG AA**, **auditoria** e **filas idempotentes**.
- **Chatbot omnichannel** com atendimento humano funcionando e integrado; **Webmail** com ADR + integração/administração; **construtor de formulários/páginas** com exportações e CAPTCHA; **busca full-text em documentos**; **gráficos e satisfação exportáveis**; **relatórios TCE-MT**.
- Testes (incl. negativos) verdes.

## Documentação (obrigatória)

`docs/aderencia-tr-barao/` com: **Matriz de Aderência** (`matriz-aderencia.md` + `.csv`), **gap plan** priorizado (esforço × impacto), **ADRs** (Webmail make-or-buy; chatbot omnichannel; indexação full-text; construtores visuais), **specs** dos novos módulos, **guia de configuração de borda** (WAF, geo-bloqueio, modo manutenção), **oferta de assessoria PNTP**, e atualização de `CLAUDE.md`/`specs`. Atualize também o README.

## Fora de escopo

Reescrever módulos que já atendem; duplicar regra de negócio no front/app; prometer que o software, sozinho, resolve **habilitação** ou **assessoria presencial**. Mantenha tudo **em compliance com o portal**.
