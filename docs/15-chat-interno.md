# 15 — Chat interno (funcionários) + integração e-SIC

> Mensageria **backstage** entre usuários INTERNOS (servidores/gestores/ouvidor…).
> NÃO se confunde com a tramitação cidadão↔ouvidor (`manifestacao_mensagens`).
> O cidadão **nunca** acessa o chat interno. Spec: `prompts/chat-interno-prompt/`.

## Visão geral

```
Internos (web)  ── widget flutuante (canto inf. direito, logado)
       │ REST + WebSocket (socket.io /api/socket.io)
       ▼
NestJS ── ChatController (REST) · ChatGateway (tempo real, adaptador Redis)
       └── PostgreSQL + RLS (visibilidade restrita aos PARTICIPANTES)
       └── Biblioteca de mídia (avatares e anexos RESTRITOS)
```

## Modelo de dados (migration 025, RLS por tenant)

| Tabela | Conteúdo |
|---|---|
| `chat_conversas` | `tipo` dm \| grupo \| protocolo; `titulo`; `manifestacao_id` (quando protocolo); `criado_por` |
| `chat_participantes` | conversa × usuário + `ultimo_lido_em` (define a visibilidade e o não-lido) |
| `chat_mensagens` | autor, `conteudo`, `anexos` (jsonb restrito), `respondendo_a`, `editado_em`, `excluido_em` |
| `users.avatar_storage_key` / `avatar_mime` | foto de perfil (mídia restrita, 256×256) |

Visibilidade: **toda** leitura/escrita valida que o usuário é **participante** da
conversa (`exigirParticipante`), além do isolamento por tenant (RLS).

## Tempo real (WebSocket)

`ChatGateway` (socket.io sob `/api/socket.io`):
- **Auth no handshake** pelo cookie `portal_session` (ou Bearer no app); só papéis
  **internos** (cidadão é rejeitado).
- **Salas:** `tenant:<id>`, `user:<id>` e `conv:<id>`. O cliente emite `entrar`
  com seus `conversaIds`; o gateway **valida participação** antes de juntar à sala
  `conv:<id>` (fecha vazamento cross-conversa/tenant).
- **Eventos:** servidor→cliente `mensagem`, `editada`, `excluida`, `lido`,
  `presenca`, `typing`; cliente→servidor `entrar`, `typing`.
- **Escala:** adaptador **Redis** (`@socket.io/redis-adapter` sobre a conexão
  ioredis) para múltiplas réplicas; socket.io faz fallback para long-polling.
- O **REST persiste** e o gateway **difunde** (`ChatService.persistir` →
  `gateway.emitirConversa`). Mensagens são deduplicadas por id no cliente.

## Contrato REST (`/api/chat`, papéis internos)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/conversas` | minhas conversas + última msg + não-lidas |
| POST | `/conversas` | criar dm (dedupe) ou grupo `{tipo, titulo?, participantes[]}` |
| POST | `/conversas/protocolo/:manifestacaoId` | **abrir/atrelar** conversa ao protocolo (e-SIC) |
| GET | `/conversas/:id/mensagens?before=` | histórico paginado |
| POST | `/conversas/:id/mensagens` | enviar texto |
| POST | `/conversas/:id/anexo` | enviar arquivo (multipart, restrito) |
| GET | `/anexo/:mensagemId/:idx` | download de anexo (participante) |
| POST | `/conversas/:id/ler` | marca lido |
| PATCH/DELETE | `/mensagens/:id` | editar/excluir (autor; auditado pelo soft-delete) |
| GET | `/usuarios?q=` | usuários internos (picker) |
| POST | `/me/avatar` · GET `/avatar/:userId` | foto de perfil (restrita) |

## Integração e-SIC ("Discutir internamente")

No painel do ouvidor (`TramitacaoAdmin`), o botão **💬 Discutir internamente**
chama `POST /chat/conversas/protocolo/:id` (cria/abre a conversa do tipo
`protocolo`, já com o ouvidor + o responsável atribuído) e dispara o evento
`abrir-chat` que abre o **widget** naquela conversa.

**Fronteira LAI/LGPD:** a conversa interna é **deliberação preparatória** e
**não** é exposta ao cidadão. Apenas a **resposta oficial** (publicada no canal
de tramitação do e-SIC — `responder`) integra o protocolo público. As duas
camadas são tabelas distintas: `chat_mensagens` (interno) × `manifestacao_mensagens`
(público).

## Web — widget flutuante

`ChatWidget` montado no **layout do admin** (só usuários internos logados):
botão no canto inferior direito com **badge de não lidas**; painel com lista de
conversas, thread, composer (texto + 📎 anexo), presença (ponto verde),
indicador de "digitando", avatares. Acessível (ESC fecha, `role="dialog"`,
foco). Foto de perfil em **Admin > Meu perfil**.

## Conformidade

- **Só internos** (RBAC) — cidadão sem acesso; auth no WS rejeita papel `cidadao`.
- **RLS por tenant** + **visibilidade por participante** em todas as operações.
- **Mídia restrita** (avatares/anexos) sem URL pública; servida pelo backend.
- **Auditoria**: edição/exclusão por soft-delete (`editado_em`/`excluido_em`).
- **LAI/LGPD**: deliberação interna separada da resposta oficial.

## Pendências (próxima rodada)

- **Tela de chat no App** (Expo) com câmera/galeria e **push** (o pipeline de
  notificações e os tokens já existem).
- **Notificações offline** do chat (push/e-mail/WhatsApp quando o destinatário
  está ausente) — reusar `NotificacoesService`.
- **@menções**, fixar mensagem, busca em mensagens e recibos de leitura no UI.

## Deploy (gotcha)

O Nginx precisa repassar o **upgrade WebSocket** no `/api` (o socket.io vive em
`/api/socket.io`): adicionado `map $http_upgrade $connection_upgrade` em
`nginx.conf` e `proxy_set_header Upgrade/Connection` no `location /api/` do vhost
curinga. Cloudflare suporta WebSocket por padrão.
