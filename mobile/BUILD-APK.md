# Gerar o APK de teste (EAS Build)

O app usa **EAS Build** (nuvem da Expo) para gerar o `.apk`. O perfil `preview`
(em `eas.json`) já está configurado para sair em **APK instalável** e já fixa o
tenant (`APP_TENANT=exemplolandia`). O código está pronto; só faltam os passos
que dependem da **sua conta Expo** (gratuita em https://expo.dev).

## Passo a passo (PowerShell, dentro de `mobile/`)

```powershell
cd d:\Site\portal-prefeitura\mobile

# 1) CLI da EAS (uma vez por máquina)
npm install -g eas-cli            # ou use "npx eas-cli@latest <cmd>" sem instalar

# 2) Login na SUA conta Expo (interativo — só você faz)
eas login

# 3) Cria o projeto na sua conta e gera o projectId
eas init
#   -> Anote o "Project ID" (UUID) que ele exibe.

# 4) Nosso app.config.ts lê o projectId de uma env (o PUSH também depende dele):
$env:EAS_PROJECT_ID = "<cole-o-uuid-aqui>"

# 5) Builda o APK na nuvem (perfil preview)
eas build -p android --profile preview
#   -> Ao terminar, ele imprime um LINK para baixar o .apk.
#      Baixe no Android e instale (permita "fontes desconhecidas").
```

## Observações

- **projectId / push:** sem o `EAS_PROJECT_ID` o build funciona, mas o push
  (`lib/push.ts` usa `Constants.expoConfig.extra.eas.projectId`) não registra
  token. Defina a env no passo 4 antes do build para o push funcionar no APK.
  Para não redefinir sempre, dá para colocar o UUID direto no `app.config.ts`
  (`extra.eas.projectId`).
- **Ícone do app:** hoje sai com o ícone padrão do Expo. Para a marca da
  prefeitura, coloque `tenants/exemplolandia/icon.png` (1024×1024) e
  `tenants/exemplolandia/splash.png`; o `app.config.ts` os usa automaticamente.
- **API:** o APK aponta para `https://exemplolandia.lidera.app.br` (campo
  `apiUrl` de `tenants/exemplolandia.json`). Para testar contra outro município,
  troque o tenant: `eas build -p android --profile preview` com
  `APP_TENANT` ajustado no `eas.json`, ou crie `tenants/<slug>.json`.
- **Outra prefeitura = outro app:** white-label. Crie `tenants/<slug>.json`,
  ajuste `env.APP_TENANT` no perfil e rebuilde.

## Alternativa 100% local (sem nuvem)

Exige Android SDK + JDK 17 instalados nesta máquina:

```powershell
npx expo run:android --variant release
```

É bem mais pesado de configurar; o caminho EAS acima é o recomendado para o
primeiro APK de teste.
