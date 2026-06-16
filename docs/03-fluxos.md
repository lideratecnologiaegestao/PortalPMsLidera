# 03 — Fluxos

## Resolução de tenant + RLS (toda requisição)

```mermaid
sequenceDiagram
    participant C as Cliente
    participant MW as TenantMiddleware
    participant ALS as AsyncLocalStorage
    participant S as Service
    participant P as PrismaService
    participant DB as PostgreSQL (RLS)
    C->>MW: requisição (Host)
    MW->>MW: resolve tenant pelo domínio/subdomínio
    MW->>ALS: run({ tenantId })
    ALS->>S: cadeia segue no contexto
    S->>P: prisma.db.<model>.<op>()
    P->>DB: BEGIN; set_config('app.current_tenant_id', id, true); <query>; COMMIT
    DB-->>P: somente linhas do tenant (policy RLS)
    P-->>C: resposta isolada
```

## Manifestação ESIC/Ouvidoria (estados)

```mermaid
stateDiagram-v2
    [*] --> registrada
    registrada --> em_analise: iniciar_analise
    em_analise --> em_tratamento: encaminhar_area
    em_analise --> aguardando_cidadao: solicitar_complemento (pausa SLA)
    em_tratamento --> aguardando_cidadao: solicitar_complemento (pausa SLA)
    aguardando_cidadao --> em_tratamento: retomar (recalcula prazo)
    em_tratamento --> prorrogada: prorrogar (estende SLA)
    em_analise --> respondida: responder
    em_tratamento --> respondida: responder
    prorrogada --> respondida: responder
    em_tratamento --> indeferida: indeferir (ESIC)
    respondida --> recurso_1a_instancia: abrir_recurso_1a (ESIC)
    recurso_1a_instancia --> recurso_2a_instancia: abrir_recurso_2a (ESIC)
    recurso_1a_instancia --> respondida: responder
    respondida --> concluida: concluir
    concluida --> [*]
```

## SLA com filas

```mermaid
sequenceDiagram
    participant S as ManifestacoesService
    participant Q as Fila SLA (BullMQ)
    participant W as SlaWorker
    participant N as Fila Notificações
    participant DB as PostgreSQL
    S->>Q: add(alerta, delay=80% prazo, jobId=sla-alerta-<id>)
    S->>Q: add(vencido, delay=prazo, jobId=sla-vencido-<id>)
    Note over S,Q: idempotente por jobId; reagenda sem duplicar
    Q->>W: dispara no tempo agendado
    W->>DB: status encerrado? (no-op) senão segue
    W->>N: notifica responsável (email/WA)
    W->>DB: grava audit_log
```

## Abertura de chamado (App do Cidadão)

```mermaid
sequenceDiagram
    participant U as Cidadão (App)
    participant API
    participant DB as PostGIS
    participant OBJ as Object Storage
    U->>U: foto + GPS + categoria
    U->>API: POST /chamados (multipart: foto, geo, categoria)
    API->>API: valida tipo/tamanho da foto
    API->>OBJ: grava arquivo -> storage_key
    API->>DB: ST_DWithin (raio 30m) busca duplicado
    alt duplicado encontrado
        API-->>U: vincula ao chamado existente
    else novo
        API->>DB: cria chamado (geography Point 4326) + storage_key
        API-->>U: protocolo
    end
    Note over U,OBJ: o App nunca fala com o storage — só com a API
```

## Transparência (ETL)

```mermaid
flowchart LR
    Cont[Sistema Contábil da Prefeitura] -->|conector por fornecedor| N8N[n8n]
    N8N -->|normaliza| Q[Fila integracoes]
    Q --> W[Worker sync]
    W --> DB[(transp_* + RLS)]
    DB --> ISR[Portal ISR + cache]
    DB --> ABERTOS[API dados abertos CSV/JSON]
```
