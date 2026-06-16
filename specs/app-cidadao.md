# Spec — App do Cidadão

## 1. Objetivo
App (Expo) para abrir e acompanhar denúncias urbanas georreferenciadas.

## 2. Conformidade legal
LGPD (localização/foto = dado pessoal potencial); acessibilidade.

## 3. Requisitos funcionais
1. Abrir chamado: categoria + descrição + foto + GPS/ponto no mapa.
2. Detectar duplicado por proximidade (PostGIS `ST_DWithin`, raio configurável).
3. Mapa de chamados próximos com status.
4. Acompanhamento por protocolo + push de atualização.
5. Login gov.br (opcional para abrir, conforme política do tenant).
6. Offline-first: fila local e sincronização.

## 4. Não-funcionais
Funcionar sem rede na abertura; **foto enviada à API (multipart)** — o backend grava no object storage e guarda só a `storage_key` (o app nunca acessa o storage); permissões com justificativa; acessibilidade.

## 5. Modelo de dados
`chamados` (geography Point 4326 + GIST), `chamado_fotos`, `chamado_atualizacoes` — `db/005_app_cidadao_postgis.sql`. RLS aplicado.

## 6. Contrato de API
- `POST /api/chamados` — **multipart** `{categoria, descricao, lat, lng, fotos[]}`; a API valida e grava as fotos no storage.
- `GET /api/chamados/proximos?lat=&lng=&raio=` — mapa.
- `GET /api/chamados/:protocolo` — acompanhamento.
- `POST /api/chamados/:id/atualizacoes` — equipe atualiza status (role interna).

## 7. Fluxos
Abertura/duplicado em `docs/03-fluxos.md`.

## 8. Integrações
Object storage (URL assinada), push (Expo), fila `notificacoes`, IA opcional para classificar categoria/prioridade pela foto.

## 9. LGPD/GDPR
Minimizar localização/foto; permitir anonimato; aviso de privacidade; retenção por finalidade.

## 10. Critérios de aceite
- Abertura completa (foto+GPS) online e offline; protocolo gerado.
- Duplicado vinculado por raio; mapa lista próximos; push recebido.
- Teste de isolamento RLS; teste do caminho principal no app.

## 11. Fora de escopo
Roteirização de equipes de campo; SLA de atendimento por categoria (fase posterior).
