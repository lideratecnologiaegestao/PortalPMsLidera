---
description: Revisão read-only do diff atual antes do merge
---

Atue como `revisor-codigo`. Rode `git diff` (ou contra a branch base) e produza um parecer:

- Aderência ao `CLAUDE.md` e às Regras Invioláveis (RLS, RBAC, WCAG, prazos legais, auditoria).
- Cobertura de testes (há teste de RLS para tabela nova?).
- Riscos: segredos, SQL concatenado, falta de validação, N+1, transações ausentes.
- LGPD: novo dado pessoal sem base legal/retenção → sinalizar.

Saída: lista priorizada (Bloqueante/Importante/Sugestão) com arquivo:linha e veredito (aprovar / aprovar com ressalvas / bloquear). Não edite arquivos.
