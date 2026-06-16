# Mapa de Migração — site atual (Joomla/K2) → nova plataforma

Apoio ao `PROMPT-migracao-barao.md`. O site `https://www.baraodemelgaco.mt.gov.br/` é **Joomla + K2** (confirmado: `meta generator = Joomla!`). É uma **casca institucional** que **aponta para vários sistemas externos** (Agili, GWS, leismunicipais). **Migramos só o conteúdo hospedado no próprio Joomla — nunca o tema, e nunca os sistemas externos.**

## Domínios — escopo de raspagem

**RASPAR somente:** `www.baraodemelgaco.mt.gov.br` e `baraodemelgaco.mt.gov.br`.

**IGNORAR (nunca rastrear, raspar ou importar)** — são sistemas locados da entidade (Agili etc.), já oferecidos no portal de transparência deles; **não entram agora**:
- `*.agilicloud.com.br` (inclui `transparencia.agilicloud.com.br` e `portal.prefbaraodemelgaco-mt.agilicloud.com.br`)
- `agiliblue.agilicloud.com.br`
- `gws-sistemas.com.br`
- `leismunicipais.com.br`
- qualquer outro host externo encontrado nos links.

Os **links** para esses sistemas são **preservados como links externos** (re-link) no acesso rápido do novo portal — **sem migrar, sem espelhar, sem reescrever para interno**.

## Três blocos do portal atual

**Bloco 1 — Migrável por raspagem (vai para o seu portal):**
- Institucional: Prefeita, Vice, Ex-Prefeitos, Estrutura Organizacional (`/equipe-de-governo`), Símbolos e Hino, História, Economia, Demografia, Contato.
- Imprensa (notícias/eventos) e **Secretarias**.
- **Repositórios de documentos do próprio Joomla** (rotas-semente):
  - `/sic`, `/sic-atos-normativos`, `/sic-legislacao/sic-portaria`
  - `/contrato-e-aditivo/contrato`, `/contrato-e-aditivo/distrato`
- Redes sociais (Facebook oficial).

**Bloco 2 — Sistemas externos (manter como LINK, não migrar):** Portal da Transparência (Agili), IPTU/Alvará/Certidão/Extrato/Contribuinte/NFe/Holerite (Agili), Gestão de Pessoas/servidores (Agili), Licitações (Agili ASPX), Carta de Serviço (GWS), Legislação Municipal (leismunicipais).

**Bloco 3 — Não se raspa:** dados financeiros/fiscais em si (receitas, despesas, empenhos, folha) — vivem no ERP da Agili.

## Secretarias identificadas (seed)
Administração e Planejamento · Agricultura · Assistência Social · Cultura, Turismo, Esporte e Lazer · Educação · Finanças · Habitação e Chefe de Gabinete · Meio Ambiente (e Turismo) · Saúde · Viação e Obras.

## De-para (conteúdo do Joomla → destino)

| Conteúdo no Joomla | Destino na nova plataforma |
|---|---|
| Notícias / Imprensa / "Notícias Geral" por secretaria | Módulo **Notícias** (categoria, datas, autor, fonte, capa/legenda/crédito, corpo HTML limpo, galeria) |
| Fotos / álbuns | **Galeria de fotos** + **biblioteca de mídia (pública)** |
| Vídeos | **Galeria de vídeos** (YouTube como embed) |
| Secretarias (endereço, e-mail, telefone, horário) | Seção **Secretarias** + páginas |
| Institucional (Prefeita, Vice, Ex-Prefeitos, Estrutura, Símbolos/Hino, História, Economia, Demografia) | **Páginas institucionais** (CMS) |
| Contato | **Página de contato** (formulário **reimplementado**) |
| `/sic-legislacao/sic-portaria` (Portarias) | **Cadastro de documentos → Portarias** |
| `/sic-atos-normativos` (Atos Normativos) | **Cadastro de documentos** (tipo correspondente) |
| `/sic` (Publicações) | **Cadastro de documentos** / módulo **SIC** |
| `/contrato-e-aditivo/contrato` e `/contrato-e-aditivo/distrato` | **Cadastro de documentos → Contratos/Aditivos/Distratos** |
| Anexos (PDF/DOC/DOCX/ODT/XLS/XLSX/ZIP) em qualquer página | **Baixar → biblioteca de mídia (pública)** → vincular ao registro |
| E-mails ofuscados (anti-spam do Joomla) | **Decodificar** e gravar no campo certo |
| **Links de Transparência/IPTU/Alvará/Carta de Serviço/Legislação/etc. (Agili/GWS/leismunicipais)** | **Manter como link externo** no acesso rápido — **NÃO migrar/raspar** |
| Webmail (link no topo) | **N/A** — decisão de Webmail é à parte |

> Conteúdo institucional do portal é **público** → biblioteca de mídia **pública**. A regra de mídia **restrita** é da Ouvidoria do cidadão e **não** vem da raspagem.

## Fases do pipeline (com checkpoint humano)

```mermaid
flowchart TD
    A[0. Descoberta de URLs<br/>sitemap + MAPA DO SITE + crawl SÓ no domínio Joomla<br/>respeita robots.txt + rate limit] --> B[1. Inventário + classificação<br/>CSV: URL → tipo → destino<br/>cache do HTML cru localmente]
    B --> C{Checkpoint humano<br/>revisar/corrigir o de-para}
    C -->|aprovado| D[2. Extração + limpeza<br/>tira tema/menus/rodapé, decodifica e-mails,<br/>baixa imagens/anexos, normaliza datas pt-BR]
    D --> E[3. Re-hospedagem de mídia<br/>biblioteca de mídia via API multipart<br/>dedup por checksum]
    E --> F[4. Importação de conteúdo<br/>via API, idempotente por URL+hash,<br/>RLS/tenant, reescreve links internos;<br/>links externos (Agili/GWS/leis) ficam como estão]
    F --> G[5. Redirects 301<br/>URL antiga interna → novo slug]
    G --> H[6. Reconciliação<br/>migrados / falhas / revisar manual / links quebrados / ignorados-externos]
```

## Especificidades do Joomla/K2
- **Listagem x item:** páginas `itemlist/category/...` são índices; o conteúdo está nos itens — seguir e **deduplicar** pelo **id do item K2 / URL canônica**.
- **Paginação** (limitstart) — percorrer tudo.
- **E-mail cloaking** ("JavaScript ativado") — decodificar.
- **"Leia mais"** — pegar o corpo completo do item.
- **Categoria/breadcrumb** → mapear para a taxonomia de destino.
- **Charset** (latin-1/UTF-8) → normalizar para UTF-8; **datas pt-BR** → ISO 8601.
