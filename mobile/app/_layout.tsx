import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../lib/theme';
import { AuthProvider, useAuth } from '../lib/auth';
import { AppConfigProvider, useAppConfig } from '../lib/appConfig';
import { ouvirToquesPush, registrarPush } from '../lib/push';
import { ONBOARDING_VISTO_KEY } from './onboarding';

/**
 * Ponte entre AppConfigProvider e ThemeProvider:
 * - injeta primaryColor/secondaryColor no tema assim que a config chega.
 * - redireciona para o onboarding se necessário (antes das abas).
 *
 * Está DENTRO de AppConfigProvider E ThemeProvider, por isso consegue ler
 * ambos os contextos.
 */
function ConfigBridge() {
  const { config, carregando } = useAppConfig();
  const { injetarCoresAppConfig } = useTheme();
  const router = useRouter();
  const { token } = useAuth();

  // 1. Injeta cores no tema assim que a config estiver pronta.
  const coresInjetadas = useRef(false);
  useEffect(() => {
    if (carregando || coresInjetadas.current) return;
    coresInjetadas.current = true;
    injetarCoresAppConfig(
      config.tema.primaryColor,
      config.tema.secondaryColor,
    );
  }, [carregando, config.tema, injetarCoresAppConfig]);

  // 2. Checa se deve mostrar o onboarding.
  const onboardingChecado = useRef(false);
  useEffect(() => {
    if (carregando || onboardingChecado.current) return;
    onboardingChecado.current = true;

    const { ativo, slides } = config.onboarding;
    if (!ativo || slides.length === 0) return;

    AsyncStorage.getItem(ONBOARDING_VISTO_KEY).then((visto) => {
      if (!visto) router.replace('/onboarding');
    });
  }, [carregando, config.onboarding, router]);

  // 3. Registra push quando o usuário está logado.
  useEffect(() => { if (token) registrarPush(token).catch(() => undefined); }, [token]);

  return null;
}

function Navegacao() {
  const { c, escuro } = useTheme();
  const router = useRouter();

  // Ao tocar numa notificação, abre o acompanhamento do protocolo.
  useEffect(() => {
    return ouvirToquesPush((protocolo) => router.push({ pathname: '/acompanhar', params: { protocolo } }));
  }, [router]);

  return (
    <>
      <StatusBar style={escuro ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.primary },
          headerTintColor: c.primaryFg,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="denuncia" options={{ title: 'Registrar denúncia', presentation: 'modal' }} />
        <Stack.Screen name="mapa" options={{ title: 'Selecionar no mapa' }} />
        <Stack.Screen name="acompanhar" options={{ title: 'Acompanhar protocolo' }} />
        <Stack.Screen name="servicos" options={{ title: 'Serviços' }} />
        <Stack.Screen name="unidades-proximas" options={{ title: 'Unidades perto de mim' }} />
        <Stack.Screen name="navegador" options={{ title: 'Portal' }} />
        <Stack.Screen name="noticia/[slug]" options={{ title: 'Notícia' }} />
        <Stack.Screen name="galeria" options={{ title: 'Galeria' }} />
        <Stack.Screen name="documentos" options={{ title: 'Documentos oficiais' }} />
        <Stack.Screen name="conta/login" options={{ title: 'Entrar' }} />
        <Stack.Screen name="conta/cadastro" options={{ title: 'Criar conta' }} />
        <Stack.Screen name="conta/verificar" options={{ title: 'Confirmar conta' }} />
        <Stack.Screen name="conta/recuperar" options={{ title: 'Recuperar senha' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <AuthProvider>
          <ConfigBridge />
          <Navegacao />
        </AuthProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}
