# Spec — Construtor de Formulários (bloco 8 do TR)

> Módulo de criação visual de formulários eletrônicos pelo gestor, com renderização
> pública, captação de envios, anti-spam, notificação e exportação. Multi-tenant + RLS.
> Versão 1.0 — 2026-06-11

## Objetivo / requisitos do TR (Barão de Melgaço, bloco 8)
Construtor visual (arrastar-e-soltar) · personalização (campos/layout) · tipos de campo
(texto, área, e-mail, telefone, CPF, número, data, select, checkbox, rádio, upload) ·
validações (obrigatório, formato e-mail/telefone/CPF, comprimento, regex custom) ·
CAPTCHA/anti-spam · gestão de envios (filtro/ordenação) · permissões de acesso ·
mensagem de confirmação · notificações por e-mail (CC/BCC, anexos) · armazenamento
seguro + export **Excel/XML/CSV** · responsivo.

## Modelo de dados (migration 049)

### `formularios`
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null | RLS |
| slug | text | único por tenant (rota pública) |
| titulo | text not null | |
| descricao | text | |
| schema | jsonb not null default '[]' | **lista ordenada de campos** (ver abaixo) |
| status | text not null default 'rascunho' | rascunho \| publicado \| encerrado |
| mensagem_confirmacao | text | exibida após envio |
| redirecionar_url | text | opcional, pós-envio |
| login_obrigatorio | boolean default false | exige cidadão autenticado p/ enviar |
| multiplos_envios | boolean default true | false = 1 envio por usuário/identidade |
| captcha_habilitado | boolean default true | |
| notificar_emails | text[] default '{}' | destinatários da notificação |
| notificar_cc | text[] default '{}' | |
| notificar_bcc | text[] default '{}' | |
| total_envios | int default 0 | contador denormalizado |
| criado_em / atualizado_em | timestamptz | |

**Campo do schema (objeto JSON):**
`{ id, tipo, label, nome, placeholder?, ajuda?, obrigatorio:bool, largura:'full'|'half',
opcoes?:[{label,valor}], validacao?:{minLength?,maxLength?,formato?:'email'|'telefone'|'cpf'|'numero',regex?,mensagem?},
multiplos?:bool (checkbox), accept?:string (upload mime), maxTamanhoMb?:int (upload) }`

**tipos:** `texto, textarea, email, telefone, cpf, numero, data, select, checkbox, radio, upload, secao` (título/separador estático), `paragrafo` (texto estático).
`nome` = chave estável (snake) usada nas respostas e colunas de export. Único no form.

### `formulario_envios`
| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null | RLS |
| formulario_id | uuid not null → formularios ON DELETE CASCADE | |
| dados | jsonb not null | `{ nomeCampo: valor }` |
| anexos | jsonb default '[]' | `[{campo,nome,mime,storageKey,tamanho}]` |
| cidadao_id | uuid null → users ON DELETE SET NULL | se autenticado |
| ip | inet | anti-spam/auditoria |
| user_agent | text | |
| lido | boolean default false | gestão |
| criado_em | timestamptz | |

Índices: `(tenant_id, formulario_id, criado_em desc)`; `(formulario_id)`.
RLS por tenant (app_enable_tenant_rls) em ambas. text+CHECK (sem enum PG).

## Endpoints

### Público
- `GET /api/formularios/:slug` → definição do form publicado (titulo, descricao, schema, mensagem, captchaHabilitado, loginObrigatorio). 404 se não publicado.
- `GET /api/formularios/:slug/captcha` → `{ token, pergunta }` (desafio assinado HMAC, sem estado).
- `POST /api/formularios/:slug/enviar` (multipart se houver upload) → valida (server-side: obrigatórios, formatos, comprimento, regex), anti-spam (honeypot `_hp` vazio + token captcha válido + tempo mínimo `_t`), grava envio + anexos (StorageService), incrementa total_envios, enfileira notificação. Retorna `{ ok, mensagem }`. Se `login_obrigatorio`, exige sessão; se `!multiplos_envios`, bloqueia repetição (por cidadao_id ou hash ip+ua).

### Admin (`@Roles GESTOR, ADMIN_PREFEITURA` + `@RequirePermissions('formularios.gerenciar')`)
- `GET /api/admin/formularios` (lista + total_envios) · `POST` (cria) · `GET/:id` · `PUT/:id` (titulo/descricao/schema/status/config/notificações) · `DELETE/:id`.
- `GET /api/admin/formularios/:id/envios?q=&de=&ate=&page=` (filtro/ordenação) · `GET .../envios/:envioId` (detalhe) · `PATCH .../envios/:envioId` (lido) · `DELETE`.
- `GET /api/admin/formularios/:id/export?formato=csv|xml|xlsx` → planilha dos envios (colunas = campos do schema). xlsx = SpreadsheetML (application/vnd.ms-excel), CSV `;`+BOM, XML estruturado.
- `GET /api/admin/formularios/anexo/:envioId/:idx` → download seguro do anexo (RBAC).

## Anti-spam / CAPTCHA (self-hosted, sem terceiros)
1. **Honeypot**: campo oculto `_hp`; se preenchido → descarta (200 silencioso).
2. **Tempo mínimo**: `_t` = timestamp de render; rejeita envio < ~3s.
3. **Desafio assinado**: `GET .../captcha` gera pergunta (ex.: "quanto é 3 + 4?") e `token = base64(payload).hmac` com expiração ~10min, assinado com segredo do app (reusar `AUTH_JWT_SECRET` via util HMAC). `POST enviar` manda `_captcha_token` + `_captcha_resposta`; backend valida assinatura+expiração+resposta. Só quando `captcha_habilitado`.

## Notificação
On submit, enfileirar `JOB_NOTIF_EMAIL` (fila `QUEUE_NOTIFICACOES`) com destinatários `notificar_emails` + CC/BCC; corpo = resumo das respostas; anexos = arquivos enviados (se o worker suportar; senão, link/observação). Best-effort (não falha o envio do cidadão).

## Permissões / segurança
- `formularios.gerenciar` adicionado ao catálogo (`permissions.catalog.ts`); gestor tem por padrão (ROLE_DEFAULTS), servidor via grupo.
- Uploads SEMPRE via API (multipart) → StorageService (MinIO); nunca URL pública direta; download via endpoint autenticado.
- Envios são dados pessoais (LGPD): RLS por tenant; anexos restritos; export é admin. IP guardado p/ anti-spam/auditoria.

## Frontend
- **Admin** `web/app/admin/formularios`: lista; **construtor drag-drop** (paleta de tipos → arrastar para o canvas; reordenar por drag; painel de propriedades do campo; toggle publicar; config de notificações/captcha/mensagem); **gestor de envios** (tabela filtrável + detalhe + downloads + export CSV/XML/XLSX). Drag-drop com HTML5 nativo (sem lib pesada).
- **Público** `web/app/formularios/[slug]`: renderiza o schema (responsivo, WCAG), validação client+server, captcha, mensagem de confirmação.
- Item "Formulários" no AdminShell; opcional auto-menu público por formulário publicado (fase 2).

## Fora de escopo (fase 2)
- Lógica condicional entre campos; cálculos; multi-página (wizard); integrações externas; assinatura digital; anexos no corpo do e-mail se o worker não suportar (envia resumo + aviso).
