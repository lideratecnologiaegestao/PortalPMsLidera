# App do Cidadão (Expo) — multi-tenant white-label

App de denúncias urbanas georreferenciadas + acesso à Ouvidoria/serviços do
município. Fala **somente** com a API (regra 2b): foto/anexo sobem via multipart
e a API grava no storage; o app nunca acessa banco/storage direto.

## Estrutura

```
app/
  _layout.tsx           Stack raiz (ThemeProvider + header temado)
  (tabs)/               Abas: Início · Notícias · Painel · Ajustes
  denuncia.tsx          Registrar denúncia (categoria, descrição, FOTO, GPS, anônimo, offline)
  acompanhar.tsx        Consultar protocolo (chamado) ou manifestação (protocolo + chave)
  noticia/[slug].tsx    Notícia (detalhe)
  servicos.tsx          Atalhos para serviços do portal
  mapa.tsx              Seletor de local no mapa
components/ui.tsx       Design System temado (Screen, Card, Btn, Campo, Pill, Aviso…)
lib/theme.ts            TEMA POR TENANT (cores da API /api/theme) + claro/escuro/auto
lib/api.ts              Cliente da API (chamados, notícias, manifestações)
lib/config.ts           Categorias, tipos, acesso rápido, API_URL/tenant
tenants/<slug>.json     Config white-label de cada prefeitura
app.config.ts           Config Expo DINÂMICA (lê tenants/<APP_TENANT>.json)
eas.json                Perfis de build EAS
```

## Tema por tenant (claro/escuro)

`lib/theme.ts` busca `GET /api/theme` (resolvido pelo Host do município) e usa as
**cores da marca** em runtime — trocar a cor de uma prefeitura **não exige
rebuild**. O modo claro/escuro deriva dessas cores e respeita a preferência do
usuário (Ajustes → Aparência: Claro/Escuro/Automático).

## Rodar (dev)

```bash
cd mobile
npm install
# município alvo (carrega tenants/<slug>.json):
$env:APP_TENANT = "exemplolandia"          # PowerShell
# (opcional) sobrepor a URL da API:
$env:EXPO_PUBLIC_API_URL = "https://exemplolandia.lidera.app.br"
npx expo start                              # QR para o Expo Go, ou:
npm run android / npm run ios
```

## White-label — gerar o app de uma NOVA prefeitura

1. **Crie o tenant:** copie `tenants/_template.json` para `tenants/<slug>.json` e
   preencha `name`, `scheme`, `bundleId` (`br.gov.<municipio>.cidadao`),
   `primaryColor` e `apiUrl` (domínio do município já cadastrado em `tenants` na API).
2. **(Opcional) marca:** coloque `tenants/<slug>/icon.png` e
   `tenants/<slug>/splash.png` (1024×1024). Sem isso, usa o ícone padrão do Expo.
3. **Build (EAS):**
   ```bash
   APP_TENANT=<slug> eas build --profile production --platform android
   APP_TENANT=<slug> eas build --profile production --platform ios
   ```
   (Ou adicione um perfil por tenant em `eas.json` com `env.APP_TENANT`.)
4. **Assinatura por tenant:** use credenciais (keystore Android / certificados
   iOS) próprias do ente, idealmente na conta de loja do município.
5. **OTA:** `eas update` entrega JS sem rebuild (cor/itens/telas). Rebuild nativo
   só ao mudar ícone/splash/nome/bundle.

> **Lojas (honesto):** cada prefeitura normalmente precisa de **ficha/conta
> próprias**; a App Store pode rejeitar apps "clone" muito parecidos
> (**Guideline 4.3**) — mitigue com conteúdo/município distintos e conta por ente.

## Privacidade (LGPD / DPIA)

- Localização coletada só no momento da denúncia, com justificativa.
- Denúncia anônima é honrada pelo backend (não grava `cidadao_id`).
- Fotos vão à mídia **restrita** (sem URL pública); o app nunca acessa o storage.

## Estado e pendências

**Pronto:** tema por tenant (claro/escuro) + Design System; abas
(Início/Notícias/Painel/Ajustes); denúncia com foto+GPS+anônimo+offline;
acompanhar (chamado e manifestação); notícias (lista+detalhe); serviços;
white-label (`app.config.ts` + `tenants/` + `eas.json`); **cadastro/login do
cidadão SEM gov.br** (e-mail + senha, com confirmação por **e-mail** e
**WhatsApp**) — telas em `app/conta/` + contexto `lib/auth.ts`. gov.br segue como
opção. Typecheck (`tsc`) limpo.

## Cadastro/login do cidadão (sem gov.br)

Fluxo: **Criar conta** (nome, e-mail, celular, senha) → recebe **código por
e-mail** e **código por WhatsApp** → **Confirmar conta** (o e-mail é obrigatório
para entrar; o WhatsApp confirma o número) → **Entrar**. Recuperação por código
no e-mail. Backend: `POST /api/auth/cidadao/{cadastro,verificar,reenviar,login,
recuperar,redefinir}` (multi-tenant; e-mail pelo SMTP do município, WhatsApp pela
Evolution). O `login` devolve o token no corpo (app → Bearer) e seta o cookie (web).

**Pendente (próxima rodada):**
- **Tela de chat interno** no app (backend e widget web já existem).
- **Central de notificações** (push já registra token; falta a tela de lista).
- Refino do **mapa** como seletor de local na denúncia.
- **Login do cidadão por e-mail na WEB** (o backend já suporta; falta a tela).
