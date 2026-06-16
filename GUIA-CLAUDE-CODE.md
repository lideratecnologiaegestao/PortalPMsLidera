# Guia — Executando o projeto com Claude Code

Este repositório vem preparado para o **Claude Code** desenvolver os módulos de ponta a ponta. Tudo o que ele precisa para entender o projeto já está versionado.

## O que vem no pacote

| Peça | Onde | Função |
|------|------|--------|
| Contexto-mestre | `CLAUDE.md` | Lido automaticamente; regras invioláveis, stack, fluxo de trabalho |
| Subagents | `.claude/agents/*.md` | Times especializados: arquiteto, backend, frontend, mobile, DBA/RLS, segurança/DevSecOps, LGPD, QA, revisor, tech-writer |
| Skills | `.claude/skills/*/SKILL.md` | Padrões recorrentes: RLS, FSM/SLA, tema/WCAG, gov.br, transparência |
| Slash commands | `.claude/commands/*.md` | `/nova-feature`, `/migrar-db`, `/auditoria-seguranca`, `/revisar-pr` |
| MCP | `.mcp.json` | postgres (read-only), filesystem, git, fetch, playwright |
| Specs | `specs/*.md` | Contrato por módulo que os agents implementam |
| Docs | `docs/*.md` | Arquitetura, requisitos, fluxos, segurança, DevSecOps, LGPD/GDPR, banco, mobile, escala, stack, roadmap, ADRs |
| Infra | `.github/workflows/`, `infra/` | CI, CD, pipeline de segurança, Kubernetes |

## Pré-requisitos

1. Instalar o Claude Code (`npm i -g @anthropic-ai/claude-code`) e autenticar.
2. Ajustar os MCP: o `.mcp.json` usa `${DATABASE_URL_READONLY}` e `${PROJECT_DIR}`. Defina-os no ambiente ou edite o arquivo. Na primeira sessão, aprove os servidores (ou use o `.claude/settings.json` com `enableAllProjectMcpServers`).
3. Subir a infra local: `cp .env.example .env && docker compose up -d`.

## Como conduzir

Abra o Claude Code na raiz do repo. Ele lê o `CLAUDE.md` sozinho. A partir daí:

```
# Implementar um módulo inteiro seguindo specs + agents + skills:
/nova-feature transparencia

# Mudança de banco com RLS e teste de isolamento:
/migrar-db criar tabelas transp_despesas e transp_receitas

# Auditar segurança/LGPD de uma mudança:
/auditoria-seguranca api/src/modules/transparencia

# Revisar o diff antes do merge:
/revisar-pr
```

O orquestrador delega para os subagents certos (ex.: `dba-postgres-rls` cria a migration, `backend-nestjs` implementa, `qa-testes` cobre, `revisor-codigo` revisa). As skills entram automaticamente quando o assunto casa com a descrição delas.

## Ordem sugerida (segue o roadmap)

1. `/nova-feature transparencia`
2. `/nova-feature cms-dinamico` e `/nova-feature servicos`
3. `/nova-feature app-cidadao`
4. `/nova-feature diario-oficial`
5. `/nova-feature ia-assistida`
6. Escala/multi-região (ver `docs/09` e `docs/11`).

## Garantias de qualidade embutidas

- **RLS** é exigido pelo subagent de banco e pela skill; QA inclui teste de isolamento.
- **WCAG** bloqueia o save de tema; frontend segue o Design System gov.br.
- **Prazos legais** (LAI/Lei 13.460) estão na skill de manifestações e não mudam sem ADR.
- **Segurança e LGPD** entram como gates no CI e como subagents acionáveis.

> Dica: para mudanças grandes, peça ao Claude Code para começar pelo subagent `arquiteto` (gera ADR e plano) antes de implementar.
