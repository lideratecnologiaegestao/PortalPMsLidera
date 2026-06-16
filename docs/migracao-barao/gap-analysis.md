# Gap Analysis — Nosso portal vs. site atual de Barão de Melgaço

> Objetivo: garantir que a migração **não deixe nada de fora** e que o novo portal seja **superior** ao atual (Joomla + sistemas Agili/GWS/leismunicipais).
> Base: auditoria do código (`api/src/modules`, `web/app`, `specs`) + descoberta do site de origem.

## Veredito

O site atual é uma **casca institucional Joomla** que terceiriza quase tudo que é "sistema" para fornecedores externos (Agili = ERP fiscal/tributos; GWS = carta de serviço; leismunicipais = legislação). **Nós já cobrimos o conteúdo institucional inteiro deles e oferecemos, nativamente, vários sistemas que eles não têm.** Não há nenhum item deles que nós não tenhamos como cobrir. Os "gaps" são pequenos acabamentos + alguns diferenciais de alto valor.

## Onde já somos claramente SUPERIORES (eles não têm)

- **Diário Oficial eletrônico** próprio (assinatura, busca, alertas) — eles dependem do leismunicipais.
- **e-SIC e Ouvidoria nativos** com FSM, prazos legais (LAI 20+10 / Lei 13.460 30+30), recursos 1ª/2ª instância e chat de tramitação — eles têm só páginas + formulários.
- **IA (chatbot RAG)** + **Atendimento omnichannel** + **WhatsApp** — inexistentes neles.
- **Enquetes**, **Construtor de Formulários**, **Construtor de Páginas (CMS drag-drop)**.
- **App do Cidadão / denúncias georreferenciadas (PostGIS)** — backend pronto.
- **LGPD self-service do titular (art. 18)** + registro de incidentes (art. 48).
- **Transparência com dados abertos** (CSV/JSON), dicionário CC-BY 4.0 e **scoring PNTP automático**.
- **Tema por tenant WCAG AA + VLibras + Design System gov.br**, SEO, Analytics, modo manutenção.

## Paridade de conteúdo (migra direto — já temos o módulo)

Notícias · Galeria (fotos/vídeos) · Secretarias · Documentos (Leis/Decretos/Portarias/…) · Conselhos · Concursos · Licitações · Carta de Serviços (com `urlExterna`) · Acesso Rápido com links externos · Ouvidoria · e-SIC · LGPD (políticas) · Estrutura Organizacional. **Tudo EXISTE.**

## Gaps a fechar — backlog priorizado

### P0 — Necessário para a migração de Barão ficar 100% (sem buraco vs. o site atual)

| # | Gap | Por quê | Esforço |
|---|---|---|---|
| 1 | **Tabela de redirects 301 administrável** (gerada pela migração) | São ~480 notícias + centenas de docs + institucionais com URLs Joomla legadas. Hoje só há 7 redirects *hardcoded* no `next.config.mjs`. Sem isso, perdemos SEO e geramos 404. | Médio |
| 2 | **Relatório estatístico PÚBLICO de pedidos e-SIC** ("Últimas solicitações") | O site deles tem `/ultimas-solicitacoes`. Nós só temos relatório no admin. Exigência de transparência ativa. | Pequeno |
| 3 | **SIC físico** — endereço/horário da unidade de atendimento presencial | Exigência LAI art. 9º, II e PNTP. Hoje não há campo estruturado. | Pequeno |
| 4 | **FAQ do e-SIC/Ouvidoria** | Eles têm `/perguntas-frequentes`. Hoje só referenciado em spec. Pode ser CMS ou módulo FAQ leve. | Pequeno |
| 5 | **Cadastros-padrão de Documentos faltantes**: Atos Normativos (próprio), Projetos de Lei, Distratos, Chamamento Público como documento | Para o de-para cair na taxonomia certa sem improviso. | Pequeno (seed) |
| 6 | **Templates institucionais**: Ex-Prefeitos, História, Símbolos/Hino, Economia, Demografia | Hoje viram página CMS genérica. O importador cria como CMS, mas convém template dedicado (ex.: galeria de ex-prefeitos). | Pequeno |

### P1 — Diferenciais que nos tornam nitidamente superiores

| # | Gap | Valor | Esforço |
|---|---|---|---|
| 7 | **Transparência com DADOS FISCAIS REAIS (ETL contábil)** | **O maior diferencial.** Hoje a transparência fiscal deles vive no Agili e o site só *linka*. Já temos worker de ingestão (`transparencia.worker.ts`) + fila BullMQ + n8n. Falta o **conector** (API/exportação Agili, ou importador SICONFI/CSV) para popular receita/despesa/licitações/folha/diárias/convênios reais. Resultado: transparência nativa + dados abertos + PNTP Diamante **de verdade**, não terceirizada. | Alto |
| 8 | **Legislação consolidada e pesquisável** (substituir o leismunicipais) | Temos FTS de documentos; falta a visão de "lei compilada" (texto vigente, alterações, revogações). Tira a dependência de fornecedor externo. | Médio-alto |
| 9 | **Módulo de Audiência Pública estruturado** | Hoje é só upload de documento. Estruturar (data, pauta, transmissão/vídeo, ata/resultado, vínculo a leis/obras). | Médio |
| 10 | **Datasets de Transparência faltantes**: renúncia de receita, emendas parlamentares, VTN/tributos | Hoje só como upload manual. Estruturar para virar dado aberto + PNTP. | Médio |

### P2 — Roadmap (superioridade de longo prazo)

| # | Item | Nota |
|---|---|---|
| 11 | **App móvel (Expo)** | Backend de chamados/denúncias 100% pronto; falta o app no repo. |
| 12 | **Plano Diretor** dedicado | Zoneamento, mapa, revisões, audiências vinculadas (hoje no Google Sites deles). |
| 13 | **Serviços e-gov nativos** (IPTU 2ª via, NFS-e, certidões) | Substituir Agili a longo prazo; curto prazo = link na Carta de Serviços. |

## Recomendação

- **Para o go-live de Barão:** fechar **P0 (itens 1–6)** — são rápidos e evitam qualquer regressão vs. o site atual. O resto do conteúdo migra direto nos módulos existentes.
- **Para "ser superior":** priorizar **item 7 (ETL de transparência fiscal)** e **item 8 (legislação)** — é o que transforma o portal de "casca bonita" em "plataforma de governo digital" de fato, encerrando a dependência dos sistemas externos.
- Manter como **link externo** (sem migrar agora): IPTU/Alvará/Certidão/NFe/Holerite/Dívida (Agili), Previ (RPPS) — são sistemas transacionais de terceiros; entram no Acesso Rápido / Carta de Serviços.
