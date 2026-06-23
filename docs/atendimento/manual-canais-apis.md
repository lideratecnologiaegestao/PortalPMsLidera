# Manual de Configuração de Canais de Atendimento

> Publico-alvo: operador da Lidera (super_admin) que configura cada prefeitura no Gerenciador.
> Para cada canal, este manual mostra onde obter cada credencial e onde colá-la no painel.

## Conceitos do sistema

Cada canal de atendimento é registrado na tabela `TenantWhatsappCanal` com os seguintes campos preenchidos pelo operador:

| Campo no painel | Tipo | Descrição |
|---|---|---|
| `tipo` | `whatsapp` \| `instagram` \| `messenger` \| `telegram` | Plataforma do canal |
| `metaPhoneNumberId` | texto | ID do número/página/conta (obrigatório para canais Meta; não usado no Telegram) |
| `metaToken` | texto (cifrado em repouso) | Token de acesso permanente |
| `metaAppSecret` | texto (cifrado em repouso) | App Secret do aplicativo Meta (não usado no Telegram) |
| `metaVerifyToken` | texto | Token de verificação do webhook (você define; não usado pelo Telegram como verificação Meta) |

O sistema gera automaticamente o campo `webhookSecret` (UUID único por canal). A **Callback URL** do webhook é construída a partir desse secret e exibida no painel pelo botão "Webhook" de cada canal.

---

## WhatsApp (Cloud API oficial da Meta)

### 1. Pré-requisitos

- Conta no [Meta Business Manager](https://business.facebook.com) verificada (verificação de empresa).
- Número de telefone profissional (pode ser novo ou portado) associado a uma conta WhatsApp Business.
- Acesso de administrador ao [Meta for Developers](https://developers.facebook.com).

### 2. Criar o aplicativo Meta

1. Em [developers.facebook.com](https://developers.facebook.com), clique em **Meus Apps > Criar App**.
2. Escolha o tipo **Business** (ou "Empresa").
3. Dê um nome interno (ex.: `Portal Prefeitura — WhatsApp`) e associe ao seu Meta Business Manager.
4. Adicione o produto **WhatsApp** ao app clicando em "Adicionar produto" no painel do app.

### 3. Obter o Phone Number ID

1. No painel do app, vá em **WhatsApp > Configuração**.
2. Em "Números de telefone", localize o número da prefeitura.
3. Copie o **Phone Number ID** (número numérico longo).
   - Campo no painel: `metaPhoneNumberId`

> O **WhatsApp Business Account ID** (`metaWabaId`) é opcional — fica visível na mesma tela, logo acima dos números.

### 4. Gerar o token permanente (System User)

Tokens de página expiram. Use um **System User** para obter token permanente.

1. No Meta Business Manager, vá em **Configurações da Empresa > Usuários > Usuários do Sistema**.
2. Crie um usuário de sistema (tipo "Administrador").
3. Clique em **Gerar novo token** para esse usuário.
4. Selecione o app criado no passo 2.
5. Marque as permissões: `whatsapp_business_messaging` e `whatsapp_business_management`.
6. Copie o token gerado (ele só aparece uma vez).
   - Campo no painel: `metaToken`

### 5. Obter o App Secret

1. No painel do app, vá em **Configurações > Básico**.
2. Clique em "Mostrar" ao lado de **Segredo do App**.
3. Copie o valor.
   - Campo no painel: `metaAppSecret`

### 6. Definir o Verify Token

Você escolhe qualquer string (ex.: `prefeitura-abc-wpp-2026`). Guarde-a.
- Campo no painel: `metaVerifyToken`

### 7. Configurar o webhook no painel Meta

1. No painel do sistema, salve o canal com todos os campos preenchidos.
2. Clique no botão **"Webhook"** ao lado do canal — a Callback URL é exibida (formato: `https://SEU_DOMINIO/api/webhooks/meta-canal/WEBHOOK_SECRET`).
3. No painel do app Meta, vá em **WhatsApp > Configuração > Webhooks**.
4. Cole a **Callback URL** e o **Verify Token** (o mesmo que você digitou em `metaVerifyToken`).
5. Clique em **Verificar e Salvar**.
6. Assine o campo **`messages`** clicando em "Assinar" ao lado dele.

---

## Instagram Direct

### 1. Pré-requisitos

- Conta Instagram **Profissional** (Empresa ou Criador de Conteúdo).
- A conta Instagram deve estar **vinculada a uma Página do Facebook** que você administra.
- App Meta com permissões específicas do Instagram.

### 2. Permissões necessárias no app Meta

No painel do app, em **Configurações > Permissões do App**, adicione e solicite aprovação para:

- `instagram_basic`
- `instagram_manage_messages`
- `pages_messaging`

### 3. Obter o Instagram Account ID / Page ID

1. No painel do app, adicione o produto **Instagram** (ou **Messenger**).
2. Vá em **Instagram > Configuração de API** ou use o **Graph API Explorer**.
3. Obtenha o **ID da conta do Instagram** (ou o **Page ID** da Página do Facebook vinculada, dependendo da versão da API).
   - Campo no painel: `metaPhoneNumberId` (reutilizado para o ID da conta/página)

### 4. Page Access Token

1. No **Graph API Explorer** ([developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)), selecione seu app e a página vinculada.
2. Gere um token com as permissões listadas acima.
3. Para token de longa duração, troque via endpoint `/oauth/access_token` com `grant_type=fb_exchange_token`.
   - Campo no painel: `metaToken`

### 5. App Secret e Verify Token

Iguais ao WhatsApp — use o mesmo App Secret do app Meta (`metaAppSecret`) e defina um `metaVerifyToken` de sua escolha.

### 6. Configurar o webhook

1. Salve o canal no painel e copie a Callback URL (botão "Webhook").
2. No painel do app Meta, vá em **Instagram > Webhooks** (ou **Webhooks** no menu do produto).
3. Cole a Callback URL e o Verify Token.
4. Assine o campo **`messages`** no objeto **Instagram**.

---

## Facebook Messenger

### 1. Pré-requisitos

- **Página do Facebook** da prefeitura (não perfil pessoal).
- App Meta com permissão `pages_messaging`.

### 2. Permissões necessárias

No app Meta, solicite:
- `pages_messaging`
- `pages_read_engagement` (para leitura de dados da página)

### 3. Obter o Page ID

1. Na Página do Facebook, vá em **Configurações > Informações da Página**.
2. Role até o final — o **Page ID** é exibido lá.
   - Campo no painel: `metaPhoneNumberId`

### 4. Page Access Token

1. No **Graph API Explorer**, selecione seu app e a Página.
2. Gere o token com `pages_messaging` ativo.
3. Para token permanente, use o mesmo processo de troca descrito no Instagram.
   - Campo no painel: `metaToken`

### 5. App Secret e Verify Token

Mesmos valores do app Meta compartilhado (`metaAppSecret` e `metaVerifyToken` de sua escolha).

### 6. Configurar o webhook

1. Salve o canal e copie a Callback URL (botão "Webhook").
2. No painel do app Meta, vá em **Messenger > Configuração de Webhooks**.
3. Cole a Callback URL e o Verify Token.
4. Assine os campos **`messages`** e **`messaging_postbacks`** no objeto **Page**.

---

## Telegram

### 1. Criar o bot

1. Abra o Telegram e inicie uma conversa com **@BotFather**.
2. Envie `/newbot`.
3. Escolha um nome de exibição (ex.: `Atendimento Prefeitura ABC`) e um username terminando em `bot` (ex.: `prefeitura_abc_bot`).
4. O BotFather responde com o **token do bot** no formato `123456789:AAF...`.
   - Campo no painel: `metaToken`

### 2. Secret token (opcional)

Você pode definir uma string aleatória (ex.: `meu-secret-telegram-2026`) para que o Telegram inclua no header `X-Telegram-Bot-Api-Secret-Token` de cada requisição ao webhook. Isso adiciona uma camada de verificação.
- Campo no painel: `metaVerifyToken` (opcional para Telegram)

### 3. Registrar o webhook

Diferentemente dos canais Meta, **o Telegram NÃO exige configuração manual de webhook no site externo**. Basta:

1. No painel, preencher `metaToken` com o token do BotFather e salvar o canal.
2. Clicar no botão **"Configurar webhook automaticamente"**.
3. O sistema chama `POST https://api.telegram.org/bot<TOKEN>/setWebhook` com a URL correta — o registro é instantâneo.

Não há nada para configurar no site do Telegram.

---

## Tabela-resumo

| Plataforma | `metaPhoneNumberId` | `metaToken` | `metaAppSecret` | `metaVerifyToken` | Webhook |
|---|---|---|---|---|---|
| **WhatsApp** | Phone Number ID (Meta) | System User Token permanente | App Secret (Configurações > Básico) | String livre sua escolha | Colar no painel Meta > WhatsApp > Webhooks; assinar `messages` |
| **Instagram Direct** | Instagram Account ID ou Page ID | Page Access Token (longa duração) | App Secret (mesmo app) | String livre sua escolha | Colar no painel Meta > Instagram > Webhooks; assinar `messages` |
| **Facebook Messenger** | Page ID da Página | Page Access Token (longa duração) | App Secret (mesmo app) | String livre sua escolha | Colar no painel Meta > Messenger > Webhooks; assinar `messages` e `messaging_postbacks` |
| **Telegram** | Nao usado | Token do bot (@BotFather) | Nao usado | Secret token opcional | Clicar "Configurar webhook automaticamente" no painel — sistema chama setWebhook |

---

## Seguranca das credenciais

- Os campos `metaToken` e `metaAppSecret` (e equivalentes) são **cifrados em repouso** com AES-256-GCM antes de serem gravados no banco. O valor bruto nunca persiste em disco.
- O `webhookSecret` (gerado automaticamente, UUID) é o identificador externo do canal nos endpoints de webhook. Ele é UNIQUE globalmente e permite que o sistema identifique o tenant sem expor o `tenant_id`.
- Somente o super_admin (operador Lidera) pode criar e editar canais no Gerenciador. Administradores de prefeitura não acessam as credenciais — apenas veem se o canal está ativo.
- Credenciais nunca aparecem em logs, respostas de API ou no frontend — apenas o status "definido/nao definido" é retornado.
- Rotacione tokens Meta e Telegram periodicamente pelo mesmo fluxo (editar canal, colar novo token, salvar).
