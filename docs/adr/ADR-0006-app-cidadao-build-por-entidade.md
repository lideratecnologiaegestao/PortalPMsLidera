# ADR-0006 — App do Cidadão: Config por Painel Admin e Pipeline de Build por Entidade

- **Status:** Proposto
- **Data:** 2026-06-20
- **Módulos afetados:** mobile/, api/src/modules/app-config/, api/src/modules/platform/
- **Migrations:** db/0NN_app_config.sql (a numerar)
- **ADRs relacionados:** ADR-0001 (config por entidade / padrão satélite), ADR-0005 (controle de acesso)

## Contexto

O App do Cidadão é hoje um app Expo white-label. O tenant é fixado em tempo de build por `APP_TENANT` → `mobile/tenants/<slug>.json`. O build é manual (dev roda `eas build`). Cada nova prefeitura exige intervenção de um dev da Lidera.

Evolução necessária em duas dimensões:
1. **Config em runtime** — tema, onboarding, módulos ativos, push e integrações alteráveis pelo gestor no painel SEM rebuild.
2. **Build por entidade no painel** — gestor dispara APK de teste (interno) e, depois, build de produção (AAB → Play Store), com IA que conduz e diagnostica falhas.

### Inventário build-time vs runtime

**RUNTIME (API, sem rebuild):** primaryColor/tema, logo (URL), módulos on/off (denúncia, mapa, ouvidoria, e-SIC, chat, serviços, carteira), onboarding slides, acesso rápido, categorias de chamados, push (canais), privacidade/acessibilidade URLs, biometria, cache offline.

**BUILD-TIME (exige rebuild + novo APK):** name, bundleId, scheme, icon.png 1024², splash.png, cor do splash, apiUrl, easProjectId/easOwner, versão, permissões nativas.

O app já consome o tema da API em runtime (`useTheme()`). Falta: tabela `tenant_app_config`, endpoint `GET /api/app-config`, o painel admin, e o pipeline de build.

## Telas atuais (mobile/app/) e a questão do "não-navegador"

App NATIVO: `(tabs)` painel/notícias/avisos/config; `denuncia.tsx` (câmera+GPS+offline), `mapa.tsx`, `acompanhar.tsx`, `servicos.tsx`, `conta/*` (login/cadastro/verificar/recuperar), `noticia/[slug].tsx`. **`navegador.tsx` é uma WebView interna** — legítima para conteúdo editorial longo (privacidade, diário, documentos), mas NÃO deve substituir tela nativa. Hoje `servicos.tsx` e `config.tsx` jogam tudo no WebView → corrige-se restringindo o WebView a conteúdo informacional; fluxos recorrentes (denúncia, ouvidoria, acompanhar, login) são nativos.

## Alternativas

- **A — Só config runtime (build manual):** baixo custo/risco, mas o gestor não tem autonomia para o que exige rebuild. Não escala.
- **B — Build via EAS Cloud disparado pelo painel:** backend monta o projeto + dispara `eas build --non-interactive --no-wait` com `EXPO_TOKEN`, faz polling e entrega o link. Viável. Custo de EAS credits ($1–$4/build). **Limite real:** não há API pública para criar projeto EAS — `eas init` por tenant é manual (~5 min, uma vez).
- **C — Build self-hosted (Android SDK em Docker/WSL2):** `eas build --local` NÃO é suportado em Windows/WSL2; container pesado (5–10 GB), 4–8 GB RAM/build no servidor compartilhado. **Risco alto, rejeitado.**
- **D — GitHub Actions + EAS:** camada intermediária extra; só se EAS credits forem o gargalo.

## Decisão

**Fase 1 = Alternativa A (config runtime). Fase 2+ = Alternativa B (build via EAS Cloud).** C rejeitada (risco operacional inaceitável num servidor compartilhado Windows/WSL2). D só se necessário por custo.

**Pré-requisito incontornável da Fase 2:** cada prefeitura precisa de um projeto EAS pré-criado (`eas init`) com o `easProjectId` salvo no banco. A Lidera precisa de uma **organização EAS** (plano pago) e um **EXPO_TOKEN** de robot user no backend.

## Arquitetura alvo

Tabela satélite `tenant_app_config` (padrão ADR-0001, tipada, RLS por tenant) com identidade (build-time, registrada p/ o pipeline), assets (icon/splash storage_key no MinIO), tema, módulos (booleans), onboarding (JSONB), acesso rápido (JSONB), categorias (JSONB), push. Tabela `tenant_app_builds` (perfil, status, eas_build_id, eas_build_url, log, erro_resumo IA, solicitado_por). Endpoint **público** `GET /api/app-config` (resolvido por Host, cache Redis 5 min, nunca expõe build-time secrets). Módulo `api/src/modules/app-config/` (service, controllers admin+público, build-service, BullMQ worker `QUEUE_APP_BUILD`).

### Menu "App do Cidadão" no painel (`/admin/app-cidadao`, admin_prefeitura/super_admin)
Abas: **Identidade & Ícones** · **Onboarding** · **Módulos** · **Tema** · **Integrações** · **Builds**.

### Pipeline de build (Fase 2)
```
Gestor → POST /api/admin/app-config/builds {perfil}
  → valida pré-requisitos (easProjectId, EXPO_TOKEN, ícone, apiUrl)
  → cria tenant_app_builds (enfileirado) → job QUEUE_APP_BUILD
Worker:
  1. Prepara projeto em /tmp/builds/<id>/ (código mobile/ + gera tenants/<slug>.json + baixa icon/splash do MinIO)
  2. eas build -p android --profile <perfil> --non-interactive --no-wait --json  (env EXPO_TOKEN)
  3. Polling eas build:view --json (60s, timeout 40 min)
  4. Se falhou → manda log ao Anthropic → erro_resumo (diagnóstico IA)
  5. Notifica admin (push/email) + audit_log; limpa /tmp
Gestor acompanha via GET builds/:id (SSE/long-poll); baixa o APK.
```
Worker dedicado (container com eas-cli) recomendado. `EXPO_TOKEN` só em env (nunca no banco), uso auditado.

## O que a IA resolve de verdade (sem hype)
**Resolve:** validar ícone (1024², PNG, fundo opaco, contraste); escrever ficha da Play Store (título/descrição); **diagnosticar falha de build** (lê o log EAS); guiar o gestor passo a passo; redigir textos do onboarding.
**NÃO resolve:** criar projeto EAS (`eas init` é interativo); assinar keystore de produção; submeter à Play Store sem credenciais; garantir aprovação do Google; fazer build sem o `easProjectId`.

## Play Store (decisão IRREVERSÍVEL após 1º upload de produção)
- **Opção 1 — conta única da Lidera:** rápido, mas o Google desaconselha white-label centralizado (violação num app pode suspender todos). Aceitável só como bootstrap.
- **Opção 2 — conta por prefeitura (recomendada):** app sob a conta gov da prefeitura (selo "Governo" do Play, mai/2024); Lidera entra como desenvolvedora. Mais burocracia, correto a longo prazo.
O bundleId segue `br.gov.<municipio>.cidadao`. APK de teste (preview) não depende da Play Store (distribuição por link).

## Plano em fases
- **Fase 1 (MVP, ~3 sem, SEM dependência externa):** migration `tenant_app_config` + módulo + `GET /api/app-config` + upload ícone/splash + menu `/admin/app-cidadao` (Identidade/Onboarding/Módulos/Tema/Integrações) + app consome a config (módulos, onboarding, tema, acesso rápido). IA valida ícone.
- **Fase 2 (~4 sem):** `tenant_app_builds` + worker `QUEUE_APP_BUILD` + aba Builds + polling/SSE + diagnóstico IA. Pré-req: `eas init` por tenant + plano EAS + EXPO_TOKEN.
- **Fase 3:** perfil production (AAB) + `eas submit` opcional + ficha da Play Store pela IA + doc de onboarding da conta Play da prefeitura.
- **Fase 4 (incremental):** IA de crash reports, melhorias, alertas de policy.

## Decisões a confirmar com o cliente
1. **Conta Play Store:** Lidera (centralizado, risco) vs por prefeitura (recomendado). Irreversível após 1º upload.
2. **Orçamento EAS:** aceita custo por build ($1–$4)? Repassado na mensalidade ou cobrado à parte?
3. **Prefeitura piloto** para validar o pipeline (precisa de `eas init`).
4. **minSdkVersion Android** (API 26 ~94% vs API 29 ~85%).
5. **Distribuição do APK de teste:** link público do EAS vs Firebase App Distribution.
6. **Serviços de alta frequência:** tela nativa já na Fase 1 ou WebView até a Fase 3.
7. **Biometria:** Fase 1 ou depois.

## LGPD / Segurança
`tenant_app_config` sem PII. `EXPO_TOKEN` = segredo crítico (só env, rotacionar, auditar). Diretórios temporários de build limpos ao fim (+ cron de limpeza). Fronteira de camadas mantida: app fala só com a API; nenhuma credencial EAS chega ao frontend/app. Auditoria obrigatória de builds.

## Fontes
docs.expo.dev (programmatic access, CI builds, local builds, billing/pricing), Play Console Help (white-label best practices, fev/2025), 9to5google (Government apps badge, mai/2024).
