# Guia de Borda Cloudflare: WAF, Geo-bloqueio e Restrição Admin por IP

> Referência: bloco 3 do TR (Segurança/Firewall/WAF). Contexto: o portal roda atrás de Cloudflare Zero Trust (túnel `cloudflared` no servidor Lidera). Nenhuma porta é exposta diretamente à internet — todo tráfego passa por CF → Nginx → containers. Esta documentação cobre **o que configurar na borda (Cloudflare)**, complementando o que a aplicação já faz internamente.

---

## Divisão de responsabilidades

| Camada | Responsável | O que faz |
|---|---|---|
| **Borda (Cloudflare)** | Este guia | WAF, rate limiting externo, geo-bloqueio, restrição /admin por IP, bot mitigation, DDoS L7, alertas |
| **Aplicação — API** | NestJS (`ThrottlerModule`) | Rate limiting por rota/IP no nivel da app, validacao de input (class-validator), autenticacao JWT |
| **Aplicação — dados** | Prisma + PostgreSQL (RLS) | Isolamento entre tenants, policies por row, papel `portal_app` sem BYPASSRLS |
| **Aplicação — acesso** | `RolesGuard` + `PermissionsGuard` | RBAC + permissoes granulares por modulo |
| **Transporte** | Nginx + cloudflared | TLS terminado na borda CF; comunicacao interna em HTTP plain na rede Docker |

A borda nao substitui os controles da aplicacao — sao camadas independentes. Uma regra WAF que deixa passar nao da permissao na app; um bypass de WAF nao vence o RBAC.

---

## 1. WAF — Managed Rules e OWASP

### 1.1 Ativar Managed Rulesets

No painel Cloudflare > **Security > WAF > Managed rules**:

1. Habilitar **Cloudflare Managed Ruleset** (cobre SQLi, XSS, RCE, path traversal, etc.).
2. Habilitar **OWASP Core Ruleset** — modo **Block** para score >= 25 (ajustar se gerar falsos positivos nos primeiros dias em modo Log).
3. Habilitar **Cloudflare Exposed Credentials Check** (detecta credenciais vazadas em tentativas de login).

Recomendacao de implantacao: comecar em modo **Log** por 48h, revisar o painel de eventos, promover para **Block** apos validacao.

### 1.2 Custom WAF rules para a API e admin

Acesse **Security > WAF > Custom rules > Create rule**.

**Regra 1 — Rate limit na API (rejeitar abuso de endpoint público):**

```
Expression:
  (http.request.uri.path matches "^/api/") and
  (not ip.src in $lista_ips_confiaveis)
Action: Rate limit
Threshold: 200 requests / 1 minute / IP
Action on threshold: Block (duration: 10 minutes)
```

Esta regra complementa o `ThrottlerModule` da app, agindo antes de o request chegar ao container.

**Regra 2 — Bloquear metodos incomuns na API:**

```
Expression:
  (http.request.uri.path matches "^/api/") and
  (not http.request.method in {"GET" "POST" "PUT" "PATCH" "DELETE" "OPTIONS"})
Action: Block
```

**Regra 3 — Proteção extra no endpoint de login:**

```
Expression:
  (http.request.uri.path eq "/api/auth/login" or
   http.request.uri.path eq "/api/auth/cidadao/login") and
  (not ip.src in $lista_ips_confiaveis)
Action: Rate limit
Threshold: 10 requests / 1 minute / IP
Action on threshold: Block (duration: 30 minutes)
```

---

## 2. Geo-bloqueio

### 2.1 Bloquear países fora do Brasil (configuração recomendada)

O portal serve exclusivamente municipios brasileiros. Bloquear trafego internacional reduz superficie de ataque sem impacto no uso legitimo.

Acesse **Security > WAF > Custom rules > Create rule**:

```
Nome: Geo-block — permitir apenas BR
Expression:
  (not ip.geoip.country eq "BR") and
  (not ip.src in $lista_ips_confiaveis)
Action: Block
```

`$lista_ips_confiaveis` e um IP List (ver secao 2.2) para excepcoes necessarias (ex.: equipe do fornecedor fora do Brasil, monitoramento externo).

### 2.2 IP Lists (allowlist de IPs confiáveis)

Acesse **Manage Account > Configurations > Lists > Create list** (tipo: IP).

Crie a lista `lista_ips_confiaveis` com:
- Faixa LAN do municipio (`192.168.130.0/24` conforme docs/12).
- IPs fixos da equipe tecnica do fornecedor.
- IPs de servicos de monitoramento externo (UptimeRobot, Grafana Cloud, etc.).

Referencie essa lista nas expressoes das regras como `ip.src in $lista_ips_confiaveis`.

### 2.3 Modo de emergência: bloquear tudo exceto allowlist

Em caso de ataque direcionado, ativar temporariamente:

```
Expression:
  (not ip.src in $lista_ips_confiaveis)
Action: Block
```

Reverter apos conter o incidente.

---

## 3. Restrição de acesso ao /admin e /plataforma por IP

O painel admin (`/admin`) e o painel de plataforma (`/plataforma`) nao devem ser acessiveis da internet aberta. Ha duas abordagens; use a combinada para maximo controle.

### 3.1 Cloudflare Access (Zero Trust) — recomendado para admin

Acesse **Zero Trust > Access > Applications > Add application > Self-hosted**.

- **Application domain:** `portal.prefeitura.mt.gov.br/admin*`
- **Policy:** permitir apenas emails `@prefeitura.mt.gov.br` (ou lista de emails cadastrados) + exigir MFA (TOTP via Cloudflare One-time PIN ou integrar com Google Workspace/Azure AD).
- Adicionar uma segunda regra: **IP ranges** da LAN do municipio sao liberados sem MFA adicional (acessos internos).

Esta configuracao exige que o usuario passe pela tela de login do Cloudflare Access antes de chegar ao `/admin`. O portal valida o JWT da sessao CF no header `Cf-Access-Jwt-Assertion` (a implementacao desta validacao na API e fase futura — ver secao 7).

### 3.2 WAF rule por path + IP (camada adicional)

Mesmo com Cloudflare Access ativo, adicione uma regra WAF como defesa em profundidade:

```
Nome: Bloquear /admin fora da allowlist
Expression:
  (http.request.uri.path matches "^/admin") and
  (not ip.src in $lista_ips_confiaveis)
Action: Block
```

```
Nome: Bloquear /plataforma fora da allowlist
Expression:
  (http.request.uri.path matches "^/plataforma") and
  (not ip.src in $lista_ips_confiaveis)
Action: Block
```

Combinando Access + WAF rule: mesmo que alguem descubra um bypass de CF Access, a WAF rule bloqueia o IP nao autorizado antes de chegar ao Nginx.

### 3.3 MFA obrigatório para admin

No Cloudflare Access, configure a policy para exigir **autenticacao de dois fatores**:

- Identity provider: Email OTP (built-in CF) ou integrar com Google/Azure.
- Requisito: `Authentication method = mfa`.
- Sessao maxima: 8 horas (expirar apos turno de trabalho).

---

## 4. Bot Mitigation e DDoS

### 4.1 Bot Fight Mode

Acesse **Security > Bots > Bot Fight Mode**: habilitar. Isso bloqueia bots simples automaticamente, sem configuracao adicional.

Para planos Business/Enterprise: **Super Bot Fight Mode** com protecao contra bots verificados (Google, Bing) e bots nao verificados — configurar separadamente.

### 4.2 DDoS L7 Protection

Acesse **Security > DDoS > HTTP DDoS attack protection**: ja habilitado por padrao no Cloudflare. Revisar as configuracoes:

- **Sensitivity level:** Medium (reduzir para Low se houver falsos positivos com trafego legitimo alto).
- **Action:** Managed Challenge para trafego suspeito (melhor UX que Block direto).

Para picos esperados (lancamento do portal, eventos do municipio), usar **Rate Limiting** preventivo na rota `/api/*` e avisar o suporte CF com antecedencia.

### 4.3 Security Level

Acesse **Security > Settings > Security Level**: definir como **Medium** (padrao). Em situacoes de ataque ativo, elevar temporariamente para **High** ou **Under Attack** (este ultimo exibe desafio JS a todo visitante).

---

## 5. Notificações de segurança (Alertas Cloudflare)

Acesse **Notifications > Add Notification**. Configure os seguintes alertas:

| Evento | Tipo de alerta | Destinatario |
|---|---|---|
| DDoS ativo | DDoS Attack L7 | Email/Webhook operacoes |
| WAF bloqueios em massa (> 100/min) | Security Events Alert | Email operacoes |
| Certificado SSL proximo do vencimento | SSL/TLS Certificate Alert | Email admin |
| Health check falhou (portal-web/portal-api) | Health Check Status | Email + PagerDuty/webhook |
| Bot traffic spike | Bot Management Alert | Email operacoes |

Para webhooks, use um endpoint interno (ex.: canal do chat interno do portal ou n8n) que receba o payload e notifique a equipe de plantao.

---

## 6. Checklist de configuração inicial

Execute na ordem ao provisionar um novo tenant/dominio:

```
[ ] Domínio adicionado ao Cloudflare e DNS apontando para o tunel ZT
[ ] SSL/TLS mode: Full (strict) — nunca Flexible
[ ] HSTS habilitado (min-fresh-age: 6 months, includeSubDomains)
[ ] Minimum TLS Version: TLS 1.2
[ ] Automatic HTTPS Rewrites: On
[ ] Managed Rulesets habilitados (CF Managed + OWASP)
[ ] Custom rules criadas (geo-block, rate limit /api, rate limit login, block /admin)
[ ] IP List "lista_ips_confiaveis" atualizada
[ ] Cloudflare Access configurado para /admin (email + MFA)
[ ] Bot Fight Mode: On
[ ] DDoS sensitivity: Medium
[ ] Alertas de segurança configurados (email operações)
[ ] Health checks configurados para /api/health e / (portal-web)
[ ] Testar: acesso /admin de IP nao autorizado → deve retornar 403/block
[ ] Testar: acesso /api/auth/login com > 10 req/min → deve rate-limit
[ ] Testar: acesso de IP fora do Brasil → deve bloquear (ou Managed Challenge)
```

---

## 7. O que fica como fase futura (nao implementado hoje)

- **Validacao do JWT do Cloudflare Access na API:** o header `Cf-Access-Jwt-Assertion` pode ser verificado na API (usando a chave publica do CF Access do tenant) para garantir que requests ao `/admin/*` passaram obrigatoriamente pelo CF Access, mesmo que o Nginx seja acessado por outro caminho interno. Exige um guard adicional no NestJS.
- **Cloudflare Workers para inspecao de payload:** regras de WAF customizadas com logica complexa (ex.: validar formato de protocolo no body) via Worker.
- **Page Shield:** monitoramento de scripts de terceiros carregados pelo portal (relevante se o CMS permitir embeds externos).
- **Logpush para SIEM:** enviar logs do WAF/access para Elastic/Loki para correlacao com logs da app.
