# Conectar o atendimento à API Oficial da Meta (WhatsApp Cloud + Instagram + Messenger)

Guia operacional para ligar uma prefeitura (tenant) à **WhatsApp Cloud API** oficial da
Meta — e, opcionalmente, **Instagram Direct** e **Messenger** — usando o sistema multi‑canal
do portal. Tudo é configurado pelo painel; **nenhuma credencial fica no código**.

> Pré‑requisito de infraestrutura (já atendido): a variável `PUBLIC_API` está definida no
> `portal.env` (ex.: `https://exemplolandia.lidera.app.br/api`). O webhook roteia por um
> **secret no caminho**, então essa URL serve qualquer tenant/canal — o Host não importa.

---

## Visão geral do que você vai obter na Meta

Para **WhatsApp Cloud API** você precisa de 5 valores no **Meta for Developers / WhatsApp Business**:

| Valor no painel do portal | Onde achar na Meta |
|---|---|
| **Phone Number ID** (`metaPhoneNumberId`) | App → WhatsApp → API Setup → "Phone number ID" |
| **WABA ID** (`metaWabaId`) | App → WhatsApp → API Setup → "WhatsApp Business Account ID" |
| **Token** (`metaToken`) | Token **permanente** de um System User (Business Settings → Users → System users → Generate token, com as permissões `whatsapp_business_messaging` + `whatsapp_business_management`) |
| **App Secret** (`metaAppSecret`) | App → Settings → Basic → "App secret" (usado para validar o HMAC do webhook) |
| **Verify Token** (`metaVerifyToken`) | Você **inventa** uma string secreta (ex.: 32 chars aleatórios) e cola igual nos dois lados |

> ⚠️ Use **token permanente de System User**, não o token temporário de 24h da tela de teste.
> O número precisa estar **registrado na WhatsApp Cloud API** (não pode estar logado no app
> WhatsApp comum). Para enviar fora da janela de 24h, é preciso **template aprovado** (HSM).

Para **Instagram** e **Messenger**, é o mesmo app Meta, com a Página do Facebook/conta
Instagram Profissional vinculadas, e as assinaturas de webhook `messages` ativadas.

---

## Passo a passo no portal (painel admin do tenant)

Tela: **`/admin/whatsapp/config`** (perfil ADMIN_PREFEITURA/TI da prefeitura).

### Opção A — Multi‑canal (recomendado: WhatsApp + Instagram + Messenger juntos)
Use a seção **"Canais"** (tabela `tenant_whatsapp_canais`), 1 canal por número/perfil:

1. **Criar canal** tipo `whatsapp` (e depois `instagram`, `messenger` se quiser).
2. Preencher as credenciais do canal: Phone Number ID, WABA ID, Token, App Secret, Verify Token.
3. Opcional: vincular o canal a uma **secretaria** (`secretariaId`) — útil para roteamento.
4. Salvar. O portal gera um **`webhookSecret` único** para o canal.
5. Clicar em **"webhook‑info"** do canal: ele mostra a **Callback URL** e o **Verify Token** a registrar na Meta. A URL tem o formato:
   ```
   https://<PUBLIC_API host>/api/webhooks/meta-canal/<webhookSecret>
   ```

### Opção B — Mono‑número (config legada, só WhatsApp)
Na seção **"Meta"** do formulário principal: preencher Phone Number ID / WABA ID / Token /
App Secret / Verify Token e salvar (provider = `meta`). O `metaWebhookSecret` é gerado
automaticamente. Veja a Callback URL em **"Configuração do Webhook (Meta)"**:
```
https://<PUBLIC_API host>/api/webhooks/meta/<slug-do-tenant>/<metaWebhookSecret>
```

> Em ambos os casos os **tokens são cifrados** (AES‑256‑GCM) no banco; nunca trafegam em claro.

---

## Configurar o webhook na Meta

No **Meta for Developers → seu App → WhatsApp (e/ou Webhooks) → Configuration**:

1. **Callback URL:** cole a URL do passo 5 (a do portal).
2. **Verify token:** cole exatamente o mesmo `metaVerifyToken` que você pôs no portal.
3. Clicar **"Verify and save"** — a Meta faz um `GET` de verificação; o portal responde o
   `hub.challenge` se o verify token e o secret baterem.
4. **Subscribe** aos campos de webhook: para WhatsApp, `messages`; para Instagram/Messenger,
   `messages` da Página/conta IG.
5. Para Instagram/Messenger, vincular a **Página do Facebook** e a **conta Instagram
   Profissional** ao app e conceder as permissões (`pages_messaging`, `instagram_manage_messages`).

---

## Validar a conexão

1. **Handshake:** o "Verify and save" na Meta deve dar verde (o portal já trata o GET).
2. **Inbound:** envie uma mensagem do seu celular para o número da prefeitura → deve abrir
   uma conversa no console **`/admin/atendimento`** (canal `whatsapp`/`instagram`/`messenger`).
3. **Outbound + IA:** o bot responde (FAQ/menu). Os **menus saem como botões/lista clicáveis**
   (nativo no Meta). Peça "falar com atendente" → escala e **notifica os ouvidores no WhatsApp**.
4. **Atendimento humano:** o agente responde pelo console **ou** pelo próprio WhatsApp
   (comandos `ATENDER`, `FILA`, `TRANSFERIR`, `ENCERRAR` — ver runbook do atendimento).
5. **Transferência:** o atendente de 1º nível pode **transferir para uma secretaria** (console
   ou `TRANSFERIR <secretaria>` no WhatsApp); os atendentes da secretaria são **notificados**.
   O canal de origem do cidadão é preservado (ele continua recebendo no WhatsApp/Instagram/
   Messenger/site, conforme entrou).

---

## Notas importantes (honestidade)

- **Janela de 24h:** fora dela, só dá para iniciar conversa com **template aprovado**. O
  atendimento reativo (cidadão inicia) não sofre com isso.
- **Custo:** a Meta cobra por conversa (há faixa de serviço gratuita; conversas de atendimento
  iniciadas pelo usuário costumam ser baratas/gratuitas até certo volume).
- **Número dedicado:** o número usado na Cloud API **não pode** ser usado no app WhatsApp comum.
- **Instagram/Messenger:** usam **PSID** (não telefone) — o portal já entrega a resposta do
  agente pelo PSID correto (corrigido junto desta entrega).
- **Multi‑número:** a tabela de canais permite vários números/perfis por prefeitura, cada um
  com seu webhook e, opcionalmente, vinculado a uma secretaria.

---

## Checklist rápido

- [ ] App Meta criado + produto WhatsApp adicionado; número registrado na Cloud API.
- [ ] System User com token permanente (`whatsapp_business_messaging` + `_management`).
- [ ] No portal `/admin/whatsapp/config`: criar canal `whatsapp` e colar Phone Number ID, WABA ID, Token, App Secret, Verify Token.
- [ ] Copiar a Callback URL + Verify Token do portal (webhook‑info do canal).
- [ ] Na Meta: colar Callback URL + Verify Token, "Verify and save", subscribe `messages`.
- [ ] (Opcional) Instagram/Messenger: vincular Página + conta IG, criar canais, repetir webhook.
- [ ] (Opcional) Aprovar templates HSM para mensagens proativas fora da janela de 24h.
- [ ] Cada atendente: cadastrar e **verificar** o WhatsApp no contato (para atender/ser avisado por lá).
- [ ] Testar inbound→console, bot+menus, escalar→aviso, transferir→aviso à secretaria.
