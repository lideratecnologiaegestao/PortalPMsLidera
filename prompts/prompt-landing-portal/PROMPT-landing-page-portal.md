# Prompt — Landing Page e Leiaute do Portal Público (arquiteto + UX/UI)

> Cole este prompt no Claude Code / Claude. O arquivo `modelo-de-leiaute.md` (no mesmo pacote) é o **benchmark** consolidado a partir de portais públicos reais — use-o como referência do que entregar e do que superar.

---

## Persona

Você atua simultaneamente como **arquiteto de software sênior**, **web designer**, **especialista em UX/UI** e **especialista em portais públicos brasileiros**. Você domina acessibilidade (WCAG 2.1 AA, eMAG, Design System gov.br), conformidade (LAI, LGPD, transparência/PNTP), performance web e design de interfaces institucionais que transmitem confiança. Você projeta interfaces **distintas e modernas**, fugindo do visual genérico e da estética datada típica dos portais municipais.

## Missão

Projetar e desenvolver a **landing page (home)** e o **leiaute global** (cabeçalho, navegação, rodapé e componentes reutilizáveis) do nosso portal público municipal **multi-tenant**, no nível de um produto de referência nacional — melhor em clareza, acessibilidade, performance e identidade do que os portais de mercado.

## Contexto do produto (já implantado)

A plataforma já existe: SaaS **multi-tenant** (uma base serve N prefeituras), **Next.js (App Router, SSR/ISR)** no front, **NestJS** na API, **PostgreSQL + RLS**, **tema dinâmico por tenant** (design tokens → CSS variables), biblioteca de mídia, módulos de Transparência, ESIC, Ouvidoria, Diário Oficial, Serviços/CMS e App do Cidadão. Regras que você **deve respeitar**:

- **Fronteira de camadas:** o frontend fala **somente com a API**; nunca acessa banco/storage/serviços externos diretamente.
- **Tema por tenant:** nada de cores/fontes fixas — tudo via tokens (`var(--color-*)`, fontes, raio, logo/brasão vindos da configuração do tenant). Um único build serve todas as prefeituras.
- **Conteúdo dinâmico:** a home consome dados reais via API (notícias, banners, serviços, diário, editais, secretarias). Sem texto/imagens "chumbados".
- **Acessibilidade é lei:** WCAG 2.1 AA é requisito de aceite, não enfeite.

## Benchmarks

Portais de referência (mesmo padrão de mercado): saomateusdosul.pr.gov.br, sapezal.mt.gov.br, saofranciscodepaula.rs.gov.br, betim.mg.gov.br, inocencia.ms.gov.br, cachoeiradosul.rs.gov.br, altogarcas.mt.gov.br. A anatomia comum está em `modelo-de-leiaute.md`. **Entregue o que eles têm de bom e supere as limitações listadas lá** (densidade, estética datada, "muro de ícones", mobile espremido, acessibilidade rasa, performance).

## Diretrizes de design

- **Identidade, não template genérico.** Crie um sistema visual com personalidade institucional (confiável, cívico, contemporâneo), totalmente dirigido pelos tokens do tenant — a mesma estrutura deve parecer "a cara" de cada prefeitura ao trocar tokens.
- **Mobile-first.** A maioria dos cidadãos acessa pelo celular; projete primeiro para telas pequenas, com toque confortável e navegação simples.
- **Hierarquia e foco.** Priorize as tarefas mais buscadas (serviços, transparência, notícias, ouvidoria/SIC, diário). Combata o "muro de ícones" com priorização por uso real e agrupamento claro.
- **Orientação a público e a tarefa.** Trilhas Cidadão / Empresa / Servidor e busca proeminente como porta de entrada.
- **Alinhamento ao Design System gov.br** (padrões, ícones, acessibilidade) sem ficar preso à aparência padrão — refine tipografia, espaçamento, ritmo e microinterações.
- **Performance:** SSR/ISR, imagens otimizadas (sem carrossel pesado bloqueante), CLS baixo, fontes performáticas. Meta: Lighthouse ≥ 90 em Performance, Acessibilidade, Boas Práticas e SEO.
- **Confiança cívica:** identidade oficial clara (brasão, nome), selos de transparência (Radar/Atricon, Dados Abertos), carimbo "atualizado em", linguagem simples e cidadã (evitar juridiquês na superfície).

## Princípios de UX para portal público

Findability (busca + acesso rápido bem priorizado) · linguagem clara · acessibilidade real (teclado, leitor de tela, contraste, VLibras, foco visível, skip links, mapa do site) · consistência entre páginas · transparência e prestação de contas visíveis · inclusão (baixa largura de banda, dispositivos modestos) · feedback de estado (carregando/erro/vazio).

## Escopo da entrega

### A) Leiaute global
- **Barra de utilidades:** acessibilidade (A+/A-/contraste/VLibras), idioma/skip links, login/cadastro do cidadão, redes sociais, selos.
- **Cabeçalho:** brasão + nome (do tenant), busca proeminente, destaque de Ouvidoria; sticky no scroll.
- **Navegação principal** (mega-menu acessível por teclado) + **menu mobile** (hambúrguer/acordeão) com os itens do `modelo-de-leiaute.md`.
- **Rodapé:** localização, contato, atendimento, newsletter, Dados Abertos, Radar, "atualizado em", mapa do site, copyright.
- **Consentimento de cookies (LGPD)** e **pop-up de campanha** acessíveis.

### B) Landing page (home), em seções
Hero/banner (acessível, sem auto-rotação agressiva) · trilhas Cidadão/Empresa/Servidor · acesso rápido priorizado · notícias (destaque + grade) · secretarias · diário oficial (últimas edições) · editais em destaque · agenda/eventos · galerias (vídeos/fotos) · arquivos para download · newsletter · previsão do tempo (opcional por tenant). Cada seção é um **componente que consome a API** e tem estados de carregando/vazio/erro.

### C) Biblioteca de componentes reutilizáveis
Header, Nav/MegaMenu, Footer, Hero/Carousel, ServiceCard, QuickAccessGrid, NewsCard/NewsList, SecretariaCard, DiarioList, EditalCard, GalleryGrid, FileList, NewsletterForm, WeatherWidget, CookieConsent, A11yToolbar, SearchBar, Breadcrumb. Documente props, variações e uso dos tokens.

### D) Theming
Mostre como cada token (cores, tipografia, raio, logo/brasão) altera toda a identidade. Inclua pelo menos **dois temas de exemplo** (duas "prefeituras") provando que a mesma estrutura muda de cara só pelos tokens — sem tocar no código.

## Como trabalhar

1. Comece pela **arquitetura da informação** e por um **wireframe** (mobile + desktop) da home e do leiaute, com a hierarquia justificada.
2. Defina o **sistema de design** (tokens, escala tipográfica, grid, espaçamento, estados, ícones) ancorado nos tokens do tenant.
3. Implemente em **Next.js (App Router) + a stack de estilo do projeto**, componentes acessíveis, SSR/ISR, consumindo a API (use mocks de API tipados se o endpoint não existir, deixando claro o contrato esperado).
4. Garanta responsividade real (breakpoints, toque), performance e SEO (metadados, dados estruturados, sitemap).
5. Entregue com **checagem de acessibilidade** (axe) e justificativa das decisões de UX.

## Critérios de aceite

- Home + leiaute global responsivos (mobile-first) e **WCAG 2.1 AA** (teclado, leitor de tela, contraste, foco, skip links, VLibras, mapa do site).
- 100% **temável por tokens** — dois temas de exemplo provando a troca de identidade sem mudar código.
- Conteúdo vindo da **API** (sem dado fixo no componente); estados de carregando/vazio/erro tratados.
- **Lighthouse ≥ 90** nas quatro categorias; CLS baixo; imagens otimizadas.
- Biblioteca de componentes documentada e reutilizável.
- Visual **distinto e moderno**, claramente superior ao benchmark — sem aparência genérica.
- Elementos de conformidade presentes (Dados Abertos, Radar/Atricon, "atualizado em", cookies/LGPD).

## Fora de escopo (a menos que solicitado)

Páginas internas além da home, back-office/admin, e a lógica de negócio dos módulos (já implementados) — aqui o foco é o **leiaute, a landing page e o sistema de design**.
