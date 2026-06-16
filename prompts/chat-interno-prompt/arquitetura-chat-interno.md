# Arquitetura — Chat Interno (com integração e-SIC)

Apoio ao `PROMPT-chat-interno.md`. Descreve o chat **entre funcionários** do município e como ele se integra ao **e-SIC** para buscar informação internamente. **Não** se confunde com o chat de tramitação cidadão↔ouvidor (esse é o canal público de atendimento; aqui é o "backstage" interno).

## Visão geral

```mermaid
flowchart TB
    subgraph Clientes[Usuários internos]
        WEB[Web - widget flutuante (canto inf. direito) + página de chat]
        APP[App mobile - tela de chat]
    end
    WEB -->|REST + WebSocket| API
    APP -->|REST + WebSocket| API
    subgraph Backend[NestJS]
        REST[REST: histórico, conversas, upload]
        WS[WebSocket Gateway: tempo real]
    end
    API --> REST
    API --> WS
    WS <--> REDIS[(Redis pub/sub - escala horizontal)]
    REST --> DB[(PostgreSQL + RLS)]
    WS --> DB
    REST --> MIDIA[(Biblioteca de mídia - avatares e anexos, restritos)]
    REST --> FILA[(Fila de notificações)]
    FILA --> NOTIF[Push / e-mail / WhatsApp - quando offline]
```

- **Tempo real:** WebSocket Gateway (NestJS) com **adaptador Redis** para funcionar com várias réplicas. Fallback para polling.
- **Só backend acessa** banco, storage e Redis (fronteira de camadas). O cliente conversa apenas com a API.
- **Avatares e anexos** vão para a **biblioteca de mídia** (restritos, upload via backend).

## Tipos de conversa

- **DM (1:1)** entre dois funcionários.
- **Grupo / canal** (ex.: por secretaria, equipe ou tema).
- **Conversa vinculada a protocolo** (e-SIC ou ouvidoria): thread interna ligada a um pedido, para coordenar a busca da informação.

## Integração com o e-SIC

```mermaid
sequenceDiagram
    participant CID as Cidadão (e-SIC)
    participant OUV as Ouvidor/SIC
    participant CHAT as Chat interno
    participant AREA as Área detentora (secretário/contador/jurídico…)
    CID->>OUV: pedido de informação (protocolo)
    OUV->>CHAT: abre conversa interna vinculada ao protocolo
    CHAT->>AREA: notifica e solicita a informação/documentos
    AREA-->>CHAT: responde internamente (texto + arquivos)
    OUV->>OUV: consolida a resposta oficial
    OUV->>CID: responde no canal de tramitação do e-SIC
    Note over CHAT,AREA: a deliberação interna NÃO é exposta ao cidadão;<br/>só a resposta oficial vai para o protocolo público
```

- Do **painel do e-SIC**, o ouvidor tem um atalho "**Discutir internamente**" que abre/atrela uma conversa do chat ao **protocolo**, já com os responsáveis da área.
- Arquivos trazidos pela área no chat podem ser **anexados à resposta oficial** com um clique (reuso via biblioteca de mídia), mas as mensagens internas permanecem internas.
- **LAI/LGPD:** a conversa interna é deliberação preparatória; apenas a **resposta oficial** integra o pedido do cidadão. Documente essa fronteira.

## Recursos do chat (completo)

Foto de perfil por funcionário · anexos de **arquivos e fotos** · presença (online/ausente) · indicador de "digitando" · **recibos de leitura** e badge de não lidas · **@menções** · busca em conversas/mensagens · fixar mensagem · editar/excluir (com auditoria) · histórico paginado · notificações quando offline.

## Acesso e segurança

- **Somente usuários internos** (RBAC) — cidadão não tem acesso ao chat interno.
- **RLS por tenant** + visibilidade restrita aos **participantes** da conversa.
- Anexos/avatares **restritos** (sem URL pública), servidos por endpoint autenticado.
- **Auditoria** de criação/edição/exclusão de mensagens e de acesso a anexos.
