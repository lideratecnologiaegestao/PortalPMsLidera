# Prompt — Reestruturar o Cadastro de Documentos (cadastros exclusivos + taxonomias TCE-MT)

> Cole este prompt no Claude Code / Claude. Use `classificacao-documentos.md` (mapa item→cadastro→taxonomia) e os `seeds/*.json` (taxonomias oficiais do TCE-MT com slug). **Documente tudo o que for feito.**

---

## Persona

Você atua como **arquiteto de software full-stack** e **especialista em portais de transparência pública** (TCE-MT, PNTP, LAI). Conhece a plataforma multi-tenant já implantada (Next.js + NestJS + PostgreSQL/RLS + biblioteca de mídia).

## Problema

Hoje os documentos são cadastrados num único lugar genérico (ex.: `/transparencia/documentos`). Precisamos **especializar** isso em **cadastros exclusivos**, cada um com sua **taxonomia própria** (tipos), campos próprios (número, ano, data…), **URL amigável por tipo (slug)** e **entrada de menu criada automaticamente**.

## Contexto (plataforma já implantada — estender, não reinventar)

Multi-tenant, **Next.js (App Router)** no front, **NestJS** na API, **PostgreSQL + RLS**, **biblioteca de mídia** (arquivos via backend; público mascarado ou restrito), sistema de **menu dinâmico por tenant**. Respeite: **fronteira de camadas** (front só fala com a API), **RLS por tenant**, **acessibilidade WCAG 2.1 AA**, **LGPD**.

## O que construir

### A) Cadastros exclusivos (cada um com taxonomia própria)
1. **Leis** — natureza da lei (seed `natureza_lei.json`), número, ano, data de publicação, ementa, arquivo (mídia), situação (vigente/revogada), leis relacionadas.
2. **Decretos** — tipo de decreto (taxonomia configurável pelo município), número, ano, data, ementa, arquivo.
3. **Portarias e Resoluções** — tipo (Portaria, Resolução, Instrução Normativa, Ordem de Serviço…), órgão emissor, número, ano, data, ementa.
4. **Licitações / Processos Licitatórios** — **modalidade** (seed `modalidade_licitacao.json`, com flags Lei 8.666/14.133) + **critério de julgamento** (seed `criterio_julgamento_licitacao.json`), número/ano, objeto, situação; **documentos da licitação** por fase. Inclui **Atas de Registro de Preço** como documento/subtipo.
5. **Concursos e Processos Seletivos** — **tipo do certame** (seed `tipo_concurso.json`); **documentos do certame** organizados por **situação/fase** (seed `concurso_tipo_documento.json`: Abertura, Homologação, Prorrogação…), com a flag de publicação obrigatória.
6. **Conselhos Municipais** — **tipo do conselho** (seed `tipo_conselho_municipal.json`), **membros** com papel (seed `tipo_membro_conselho.json`), atas, lei de criação, mandato.
7. **Alvarás** — tipo (Construção, Funcionamento, Sanitário, Ambiental…), número/ano, requerente, situação.
8. **Documentos (genérico)** — **tipos configuráveis pelo admin**, cada tipo com **slug** próprio e **menu automático**; agrupáveis por **área** (Saúde, Educação, Tributário, Planos). Referência opcional: `tipo_documento_diverso.json`.

> **Contratos e Aditivos** e **Convênios/Transferências** aparecem na classificação e são dimensões próprias do PNTP — crie-os como cadastros próprios (mesma mecânica) se ainda não existirem. **RGF e RREO** ficam na **Transparência financeira / Contas Públicas**, não aqui.

### B) Taxonomia + slug + menu automático (o coração da melhoria)
- Cada **cadastro** e cada **tipo** tem um **slug** (URL amigável) e gera **automaticamente** uma rota pública e um **item de menu** (use o recurso de menu dinâmico já existente). Ex.: cadastro Leis → `/leis`; filtro por natureza → `/leis/{slug-natureza}`; Documentos genérico tipo "Audiência Pública" → `/audiencias-publicas`.
- Ao **criar/editar/excluir** um cadastro ou tipo, o **menu é atualizado automaticamente** (criar nó, renomear, mover, desativar) — sem cadastro manual de menu.
- Slugs **únicos por tenant**, estáveis (mudou o slug → manter redirecionamento), sem colisão com rotas do sistema.

### C) Campos e comportamento comuns
Número, ano, **data**, título/ementa, **arquivo(s)** (sempre via **biblioteca de mídia**), situação, tags, e **filtros públicos** por tipo/ano/situação + **busca**. Listagens públicas com **download** (CSV/JSON dos metadados) e **filtro** — itens que pontuam no PNTP. Acessibilidade nas listagens e nos visualizadores.

### D) Migração do conteúdo atual
Reclassificar o que está hoje em `/transparencia/documentos` para os novos cadastros conforme `classificacao-documentos.md`, preservando URLs antigas via **redirecionamento** (não quebrar links existentes).

## Modelo de dados (estender o existente)

Para cada cadastro: tabela própria (com `tenant_id` + RLS) e uma tabela de **taxonomia/tipos** (código, descrição, **slug**, ativo, metadados como flags de lei/obrigatoriedade). Vínculo do documento → arquivo na **biblioteca de mídia**. Tabela/serviço de **menu** que reage a mudanças de cadastro/tipo (slug → rota → nó de menu). Seeds dos `seeds/*.json` por tenant na criação.

## Como trabalhar

1. **Spec** da reestruturação (entidades, taxonomias, slug/menu automático, migração) — confirme o contrato.
2. **Migrations** com RLS para cada cadastro + tabelas de tipos; **importar os seeds** TCE-MT. Teste de isolamento.
3. **Backend (NestJS):** CRUD de cada cadastro e de seus tipos; geração de **slug** e sincronização automática do **menu**; listagens públicas com filtro/busca/download; vínculo com a biblioteca de mídia.
4. **Frontend (Next.js):** telas de admin de cada cadastro (com seleção da taxonomia) e as **páginas públicas** por slug; menu populado automaticamente; acessível.
5. **Migração** + redirecionamentos das URLs antigas.

## Critérios de aceite

- Cadastros exclusivos funcionando (Leis, Decretos, Portarias/Resoluções, Licitações, Concursos/Seletivos, Conselhos, Alvarás, Documentos genérico) com as **taxonomias TCE-MT** dos seeds.
- Cada tipo tem **slug** e **entrada de menu criada automaticamente**; criar/editar/excluir tipo reflete no menu sem ação manual.
- Licitações com **modalidade + critério**; Concursos com **documentos por fase**; Conselhos com **tipo + membros**.
- Arquivos via **biblioteca de mídia**; listagens públicas com filtro/busca/download; URLs antigas redirecionadas.
- RLS por tenant, acessibilidade AA e LGPD validados; CI verde.

## Documentação (obrigatória)

Documente **tudo**: spec e ADRs (ex.: modelagem cadastro x taxonomia, geração de slug, automação de menu, estratégia de migração/redirecionamento), **modelo de dados**, **contrato de API**, **mapa de migração** (de→para), **guia do admin** (como cadastrar cada tipo e ver o menu nascer), **README** e notas de conformidade (TCE-MT/PNTP/LGPD/acessibilidade).

## Fora de escopo (a menos que solicitado)

ETL financeiro (RGF/RREO/Balanços) — fica na Transparência financeira; e a importação automática direta dos sistemas do TCE — pode ser fase posterior.
