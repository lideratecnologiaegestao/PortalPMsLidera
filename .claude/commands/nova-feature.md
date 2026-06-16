---
description: Implementa uma feature de ponta a ponta seguindo o fluxo do projeto
argument-hint: <nome-da-feature> | <módulo>
---

Implemente a feature **$ARGUMENTS** de ponta a ponta, seguindo o `CLAUDE.md`:

1. Leia a spec em `specs/` e os docs relevantes em `docs/`. Se a spec não existir, crie-a primeiro (delegue ao `tech-writer`) e confirme comigo o contrato.
2. Se houver mudança de dados, delegue ao `dba-postgres-rls` (migration em `db/` + RLS + teste de isolamento). Depois `prisma db pull` + `generate`.
3. Backend: delegue ao `backend-nestjs` (módulo, controller, service, DTOs, guards, workers).
4. Frontend/Mobile: delegue ao `frontend-nextjs` e/ou `mobile-expo` conforme o caso.
5. Testes: delegue ao `qa-testes` (incl. teste de RLS e dos caminhos críticos).
6. Se tocar dado pessoal, acione `lgpd-gdpr-dpo`; se for sensível em segurança, acione `seguranca-devsecops`.
7. Revisão: `revisor-codigo` antes de fechar. Atualize docs/spec (`tech-writer`).
8. Commit em Conventional Commits e abra PR com o template. Garanta CI verde.

Pare e me consulte se algo conflitar com as Regras Invioláveis.
