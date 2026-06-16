import { ExpoConfig, ConfigContext } from 'expo/config';
import fs from 'fs';
import path from 'path';

/**
 * Config DINÂMICA por tenant (white-label: um código, N apps).
 * O município é escolhido por `APP_TENANT` (env de build EAS) e lido de
 * `tenants/<slug>.json`. Marca estática (nome, bundle id, scheme, ícone, splash,
 * cor) é "baked" no build; o TEMA (cores) e o CONTEÚDO vêm da API em runtime
 * (trocar cor → sem rebuild; trocar ícone/nome/bundle → rebuild).
 */
interface TenantApp {
  slug: string;
  name: string;
  shortName?: string;
  scheme: string;
  bundleId: string;       // br.gov.<municipio>.cidadao
  primaryColor: string;   // splash/ícone fallback
  apiUrl: string;         // domínio do município (a API resolve o tenant pelo Host)
  easProjectId?: string;  // id do projeto EAS deste município (eas init)
  easOwner?: string;      // conta/organização EAS dona do projeto
}

const SLUG = process.env.APP_TENANT ?? 'exemplolandia';

function carregarTenant(slug: string): TenantApp {
  const file = path.join(__dirname, 'tenants', `${slug}.json`);
  if (!fs.existsSync(file)) throw new Error(`tenants/${slug}.json não encontrado (defina APP_TENANT).`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as TenantApp;
}

/** Asset do tenant se existir (tenants/<slug>/icon.png), senão undefined (Expo usa o padrão). */
function asset(slug: string, nome: string): string | undefined {
  const p = path.join(__dirname, 'tenants', slug, nome);
  return fs.existsSync(p) ? `./tenants/${slug}/${nome}` : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const t = carregarTenant(SLUG);
  const icon = asset(t.slug, 'icon.png');
  const splashImg = asset(t.slug, 'splash.png');
  return {
    ...config,
    name: t.name,
    slug: t.slug,
    scheme: t.scheme,
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ...(icon ? { icon } : {}),
    splash: {
      ...(splashImg ? { image: splashImg } : {}),
      resizeMode: 'contain',
      backgroundColor: t.primaryColor,
    },
    plugins: [
      'expo-router',
      ['expo-location', { locationWhenInUsePermission: 'Usamos sua localização para registrar o local exato da denúncia.' }],
      ['expo-image-picker', {
        photosPermission: 'Usamos suas fotos para anexar evidências à denúncia.',
        cameraPermission: 'Usamos a câmera para fotografar o problema reportado.',
      }],
    ],
    ...(t.easOwner ? { owner: t.easOwner } : {}),
    ios: { supportsTablet: true, bundleIdentifier: t.bundleId },
    android: { package: t.bundleId, permissions: ['ACCESS_FINE_LOCATION', 'CAMERA'] },
    extra: {
      apiUrl: t.apiUrl,
      tenantSlug: t.slug,
      // projectId do EAS por tenant (cada município = um app = um projeto EAS).
      // Criado via `eas init`; necessário para build e para o push.
      eas: { projectId: process.env.EAS_PROJECT_ID ?? t.easProjectId },
    },
  };
};
