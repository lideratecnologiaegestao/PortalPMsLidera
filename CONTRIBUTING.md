# Contribuição

## Fluxo Git
- Branches: `main` (protegida), `feat/<modulo>-<resumo>`, `fix/<resumo>`, `chore/<resumo>`.
- Trabalhe a partir de uma spec em `specs/`. Sem spec → crie-a antes (subagent `tech-writer`).
- PR pequeno e focado; rebase antes do merge; squash.

## Conventional Commits
`tipo(escopo): descrição` — tipos: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`.
Exemplos:
- `feat(esic): prorrogação de prazo com justificativa`
- `fix(rls): força contexto de tenant no worker de SLA`

## Definição de Pronto
Ver checklist do PR template e `CLAUDE.md`.

## Revisão
Todo PR passa por `revisor-codigo`; mudanças sensíveis por `seguranca-devsecops`; dado pessoal por `lgpd-gdpr-dpo`. CI + Security verdes são obrigatórios.

## Regras invioláveis
Ver `CLAUDE.md` (RLS, RBAC, WCAG, prazos legais, LGPD, auditoria, filas). PR que as quebra é bloqueado.
