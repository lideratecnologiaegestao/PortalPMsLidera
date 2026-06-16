# 04 — Segurança

## Modelo de ameaças (resumo STRIDE)

| Ameaça | Vetor principal | Mitigação |
|--------|-----------------|-----------|
| Vazamento cross-tenant | bug em query/filtro | **RLS** no banco (não confia no app) + teste de isolamento obrigatório |
| Elevação de privilégio | endpoint sem guard | `RolesGuard` + matriz de permissões; super_admin isolado da plataforma |
| Falsificação de identidade | sessão/token | OIDC gov.br validado (JWKS, iss/aud/exp/nonce); sessão HttpOnly; MFA p/ perfis sensíveis |
| Adulteração de dado oficial | Diário Oficial | assinatura ICP-Brasil + imutabilidade + carimbo de tempo |
| Injeção | entrada não validada | validação (Zod/class-validator), Prisma parametrizado, sem SQL concatenado |
| Webhook forjado | endpoint público | HMAC validado com `timingSafeEqual` antes de enfileirar |
| Exposição de segredo | repo/log | `${VAR}`, `.env` fora do git, secret scanning no CI |
| Abuso/DoS | endpoints públicos | rate limit, cache/ISR, filas para absorver picos |
| Repúdio | ações sem trilha | `audit_log` + eventos imutáveis de manifestação |

## Autenticação

- **Cidadão/servidor:** gov.br Login Único (OIDC + PKCE). Ver skill `govbr-login-unico`.
- **Sessão:** tokens server-side, cookies HttpOnly/Secure/SameSite; sem token em storage do browser.
- **Confiabilidade gov.br:** ações sensíveis (recurso ESIC, assinatura) exigem nível mínimo (prata/ouro).

## Autorização

- RBAC com `@Roles` + `RolesGuard`. Roles: `super_admin`, `admin_prefeitura`, `gestor`, `ouvidor`, `servidor`, `cidadao`.
- RLS complementa: mesmo autorizado a uma ação, o usuário só alcança dados do seu tenant.

### MFA (matriz)
| Role | MFA |
|------|-----|
| super_admin, admin_prefeitura, ouvidor, gestor | Obrigatório imediato |
| servidor | Obrigatório (perfil que trata dado pessoal) |
| cidadao | Conforme nível gov.br |

## Hardening

- Imagens Docker mínimas, usuário não-root, somente leitura onde possível.
- Postgres: role de aplicação **sem** `BYPASSRLS`; role read-only separada para MCP/relatórios.
- Headers de segurança no Next.js (CSP, HSTS, X-Content-Type-Options, Referrer-Policy).
- Uploads: validação de tipo/tamanho, varredura antivírus, storage isolado por tenant, URLs assinadas.
- Rotação de segredos documentada; princípio do menor privilégio em tokens de integração.

## OWASP

Régua: OWASP **ASVS** para requisitos e **Top 10** para revisão. O subagent `seguranca-devsecops` aplica o checklist a cada mudança sensível; o pipeline `security.yml` automatiza SAST/SCA/secret/IaC scan (ver [05](05-devops-devsecops.md)).

## Resposta a incidentes

Plano mínimo: detecção (alertas), contenção (revogar tokens/isolar tenant), erradicação, recuperação (restore testado), e comunicação (incl. ANPD quando houver incidente com dado pessoal — ver [06](06-lgpd-gdpr.md)).
