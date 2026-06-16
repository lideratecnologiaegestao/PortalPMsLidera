---
name: govbr-login-unico
description: Como integrar o login do cidadão e do servidor via gov.br (Login Único / Conecta gov.br) com OAuth2/OIDC neste projeto. Use SEMPRE que a tarefa envolver autenticação do cidadão, login, identidade, OAuth, OIDC, selo de confiabilidade ou níveis de conta gov.br. Acione a qualquer menção a gov.br, login único, OIDC, autenticação do cidadão ou identidade.
---

# Login Único gov.br (OIDC)

Identidade do cidadão e (opcionalmente) do servidor via gov.br, padrão OAuth2/OpenID Connect.

## Fluxo (Authorization Code + PKCE)
1. Redirecionar para o endpoint de autorização gov.br com `client_id`, `redirect_uri`, `scope` (`openid email phone profile govbr_confiabilidades`), `state` e `code_challenge` (PKCE).
2. Receber o `code` no callback; validar `state`.
3. Trocar `code` por tokens no endpoint de token (com `code_verifier`).
4. Validar o `id_token` (assinatura JWKS, `iss`, `aud`, `exp`, `nonce`).
5. Ler o `sub` (identificador único) e o nível de **confiabilidade** (bronze/prata/ouro).
6. Fazer *upsert* do usuário: `users.govbr_sub = sub`, vincular ao tenant atual. Mesmo CPF pode ser cidadão em várias prefeituras (unicidade por `tenant_id`+email).

## Selo de confiabilidade
- Algumas ações exigem nível mínimo (ex.: protocolar recurso ESIC, assinar documentos). Gateie por confiabilidade, não só por login.
- Servidores internos com perfil sensível (admin/ouvidor) exigem MFA (ver matriz em `docs/04-seguranca.md`).

## Variáveis (.env)
`GOVBR_CLIENT_ID`, `GOVBR_CLIENT_SECRET`, `GOVBR_REDIRECT_URI`, mais os endpoints do ambiente (homologação vs. produção).

## Segurança/LGPD
- Guarde só o necessário (`sub`, nome, e-mail, nível). CPF apenas se houver base legal — minimização.
- Tokens nunca no client storage; sessão server-side/HttpOnly.
- Registre o login em `audit_log` (acesso a sistema), sem dados sensíveis em claro.
- Para titulares na UE, aplicar GDPR (ver skill/doc de LGPD-GDPR).

> Confirme endpoints e escopos atuais no Guia de Integração gov.br do ambiente antes de implementar — eles mudam por release e por ambiente.
