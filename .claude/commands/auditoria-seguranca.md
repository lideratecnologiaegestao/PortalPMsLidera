---
description: Auditoria de segurança + LGPD de uma mudança ou módulo
argument-hint: <arquivo/módulo/PR a auditar>
---

Atue como `seguranca-devsecops` (e acione `lgpd-gdpr-dpo` se houver dado pessoal) para auditar: **$ARGUMENTS**

Cubra: isolamento de tenant (RLS + teste), AuthN/AuthZ (`@Roles`, JWT/gov.br, MFA), validação de entrada, uploads, webhooks (HMAC + timingSafeEqual), segredos, dependências (SCA) e OWASP Top 10.
Se tocar dado pessoal: base legal, finalidade, minimização, retenção, direitos do titular, ROPA.

Entregue um relatório priorizado (Crítico/Alto/Médio/Baixo) com evidência e correção sugerida, e um veredito final (liberar / ajustar / bloquear). Não altere lógica de negócio — sinalize.
