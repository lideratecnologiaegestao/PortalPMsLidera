# Prompt — App do Cidadão (multi-tenant, white-label, integrado à Ouvidoria)

> Cole este prompt no Claude Code / Claude. O arquivo `mapa-do-app.md` (no mesmo pacote) traz o inventário de telas, as variantes de formulário e os fluxos — use-o como referência de leiaute e comportamento. **Documente tudo o que for feito.**

---

## Persona

Você atua como **arquiteto mobile sênior (React Native/Expo)**, **especialista em UX de apps públicos**, **engenheiro de build white-label/CI-CD** e conhecedor de serviços públicos (Ouvidoria/LAI, LGPD, acessibilidade WCAG/eMAG).

## Missão

Desenvolver **por completo** o **App do Cidadão**, inspirado no leiaute e nas funcionalidades das 50 telas de referência (app Cuiabá Smart + Portal SORP), **multi-tenant** com a geração de um **APK/IPA distinto por prefeitura** para as lojas, e com a parte de **denúncias e fotos (buracos, terreno baldio, dengue, etc.) integrada à Ouvidoria** do nosso portal — gerando **protocolo**, trâmites e notificações — tudo em **compliance com o portal**. Ao final, **documente tudo**.

## Contexto (plataforma já implantada + app já iniciado)

Já temos: portal SaaS **multi-tenant** (uma base serve N prefeituras), **Next.js** no front, **NestJS** na API, **PostgreSQL + RLS** (+ **PostGIS**), **biblioteca de mídia** (uploads do cidadão são **restritos** e passam pelo backend), módulos de **Ouvidoria/e-SIC** (protocolo, máquina de estados, **SLA**, timeline de trâmites), **notificações** (push + e-mail + WhatsApp) e **roles** (incl. `cidadao`). Provavelmente **já existe um app iniciado** (React Native/Expo): **audite e complete — não recomece do zero**. Alinhe-o ao contrato da API e ao sistema de build white-label. Regras invioláveis:

- **Fronteira de camadas:** o app fala **somente com a API**; nunca acessa banco, storage ou serviços externos direto.
- **Mídia restrita:** fotos/anexos vão à **biblioteca de mídia** como **restritos** (sem URL pública), via upload multipart no backend.
- **Multi-tenant:** isolamento por tenant; o app envia o identificador do tenant (ver white-label).
- **Acessibilidade (WCAG 2.1 AA / eMAG)** e **LGPD** como requisitos de aceite.

## Estratégia multi-tenant / white-label (APK por prefeitura) — **núcleo do projeto**

Um único código-fonte, **N builds** (um por prefeitura). Implemente um **sistema de configuração por tenant** que produz, para cada município, um app distinto na loja:

- **Por tenant (baked no build):** `bundleId/applicationId` (ex.: `br.gov.<municipio>.cidadao`), **nome do app**, **ícone**, **splash**, **tokens de tema** iniciais, **API base / slug do tenant**, **deep link scheme/Universal Links**, e os **metadados da ficha de loja** (nome, descrição, screenshots, ícone).
- **Ferramentas:** **Expo + EAS Build** com **`app.config.ts` dinâmico** + **perfis de build por tenant** (ou Android *productFlavors* + iOS *schemes/targets* se for RN bare). **Assinatura por tenant** (keystore Android e certificados iOS próprios). **OTA (Expo Updates)** para entregar JS sem rebuild; **rebuild nativo** apenas quando mudar ícone/splash/nome/bundle.
- **Resolução de tenant:** diferente da web (que resolve por Host), no app o **tenant é fixado no build** (slug/id na config) e enviado à API; o **tema (tokens) e o conteúdo** podem ser **buscados na API em runtime**, permitindo ajustar cores/itens **sem republicar**.
- **Onboarding de uma nova prefeitura:** um comando/checklist que, a partir da config do tenant, gera ícone/splash/tema, define bundle/nome, monta a ficha de loja e dispara o build (Android AAB/APK + iOS IPA).

**Pontos honestos a tratar (documente):** cada prefeitura normalmente precisa de **conta/ficha próprias** nas lojas (ou publicação sob a conta do órgão); a App Store pode rejeitar apps "clone" muito parecidos (**Guideline 4.3**) — mitigue com municípios/conteúdos distintos e, idealmente, conta por ente; revisão e prazos de loja são overhead operacional.

## Funcionalidades (espelhar as referências — ver `mapa-do-app.md`)

- **Autenticação:** login (e-mail+senha), **2FA por e-mail**, cadastro (nome, e-mail, telefone, senha, aceite Política/Termos), recuperar senha (link expira ~30 min) → nova senha, verificação de e-mail.
- **Início:** saudação personalizada + clima; **Serviços em Destaque**; **Mais Serviços** (banners/carrossel); grade de **categorias**; **Links Úteis**.
- **Solicitação de Serviços (demandas urbanas):** catálogo configurável com as **4 variantes de formulário** (completo com Dados do Solicitante PF/PJ; com **Assunto**; simples; e **telefônico** que abre o discador), **anexos com limite configurável** (ex.: 0/1, 0/5), **localização (GPS/mapa)**.
- **Denúncias/Ouvidoria:** hero, busca, **Registrar Denúncia**, **Consultar Protocolo** (inclusive **anônimo**), métricas, serviços, notícias/comunicados, alerta de não duplicar.
- **Painel do Cidadão:** **Minhas Denúncias** (status), **Registrar Denúncia**, **Agendamentos**, **Alvará/Licenças** (placeholder "Em breve").
- **Detalhe da manifestação:** assunto, **status**, **protocolo**, data, **localização**, descrição e **Histórico de Trâmites (timeline)** + **Avaliar atendimento** (satisfação).
- **Notícias:** lista + busca + detalhe.
- **Notificações:** central + **push por tipo** (Geral, Alertas, Publicações, Eventos, Previsão do Tempo) + empty states.
- **Configurações:** **tema claro/escuro**, toggles de notificação, Ajuda, Sobre, Política de privacidade, Avaliar.
- **Acessibilidade no app:** redimensionar fonte, alto contraste, leitor de tela, equivalente a **VLibras**, foco visível; consentimento de privacidade.

## Integração com a Ouvidoria (denúncias + fotos + protocolo) — **requisito central**

- **Registrar Denúncia / Solicitação de Serviço = criar manifestação** no canal **ouvidoria**, com as **categorias urbanas** (buraco na via, terreno baldio, foco de dengue, barulho, iluminação, alagamento, etc.), **foto** (câmera/galeria) **+ GPS/mapa**, com opção **anônima**.
- O sistema **gera protocolo**; acompanhamento por **protocolo** (anônimo, + chave de acompanhamento) ou pelo **Painel do Cidadão** (logado); **timeline de trâmites**; **avaliar atendimento**; **push + e-mail + WhatsApp** a cada marco (conteúdo sem dado sensível — só protocolo, ação e link).
- **Fotos** vão à **biblioteca de mídia como restritas** (upload multipart no backend; **storage nunca acessado direto**). **Detecção de duplicado por raio** via PostGIS.
- **e-SIC** disponível para **cidadão logado**. Tudo via **API** (sem regra de negócio no app).

## Compliance com o portal

Camadas (só API) · multi-tenant + isolamento por tenant · **mídia restrita** · prazos/SLA da ouvidoria · **LGPD** (consentimento, minimização, **anonimato real**, mídia restrita, conteúdo de notificação sem dado sensível) · **acessibilidade** (fonte, contraste, leitor de tela, VLibras-equivalente) · **auditoria** das ações.

## Como trabalhar

1. **Auditar** o app existente e **alinhar o contrato da API** (auth/2FA, manifestação+foto+GPS, protocolo, trâmites, notícias, push, tema/tokens, catálogo de serviços).
2. **Sistema de design/tema por tenant** (tokens → claro/escuro) + navegação + estados de carregando/vazio/erro.
3. Implementar **telas e fluxos** das referências (auth, início, serviços com as 4 variantes, denúncia com **foto + GPS**, painel, detalhe + timeline, consultar protocolo anônimo, notícias, notificações, configurações, acessibilidade).
4. **White-label build:** `app.config.ts` dinâmico + perfis/flavors por tenant, geração de ícone/splash/tema, assinatura por tenant, **OTA**; **comando de onboarding** de um novo município.
5. **Push** (FCM/APNs) por tipo + **deep links**; integração de **upload de mídia restrita** e **mapa/GPS**.
6. **Testes** (incl. **teste negativo de que mídia restrita não vaza**, isolamento por tenant, fluxo de protocolo) e **pipeline de build por tenant** (CI/CD).

## Critérios de aceite

- App **completo**, espelhando o leiaute/funcionalidades das referências, com **tema por tenant** (claro/escuro) e acessível (WCAG AA).
- **Build distinto por prefeitura**: AAB/APK (Android) + IPA (iOS) com **bundle id, nome, ícone, splash e ficha** próprios; **comando/checklist** de onboarding de novo município funcionando.
- **Denúncia/serviço com foto + GPS** gera **protocolo** e cria **manifestação na ouvidoria**; **timeline de trâmites**; **consultar protocolo anônimo**; **avaliar atendimento**.
- Fotos/anexos via **biblioteca de mídia restrita** (backend); detecção de duplicado por raio.
- **Push por tipo**, deep links e notificações sem dado sensível.
- App fala **só com a API**; **LGPD**, **acessibilidade** e **auditoria** validados; **CI/CD por tenant** verde.

## Documentação (obrigatória)

Documente **tudo**: spec do app e **ADRs** (white-label/EAS, tenant *baked* x tema em runtime, OTA x rebuild, assinatura por tenant), **mapa de telas**, **contrato de API** consumido (e eventos de push/deep link), **guia "como gerar o APK de uma nova prefeitura"** (passo a passo de onboarding e publicação nas lojas), **guia do usuário**, **README** do app, **notas de loja** (Play/App Store, incl. risco 4.3) e notas de **conformidade/acessibilidade**.

## Fora de escopo (a menos que solicitado)

Pagamentos in-app, login gov.br (pode ser fase posterior), e recursos que não existem no portal. Mantenha o app como **cliente** do portal — sem duplicar regra de negócio.
