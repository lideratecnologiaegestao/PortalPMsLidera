import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '../lib/theme';
import { AuthProvider, useAuth } from '../lib/auth';
import { ouvirToquesPush, registrarPush } from '../lib/push';

function Navegacao() {
  const { c, escuro } = useTheme();
  const { token } = useAuth();
  const router = useRouter();

  // Registra o push quando o usuário está logado.
  useEffect(() => { if (token) registrarPush(token).catch(() => undefined); }, [token]);

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
        <Stack.Screen name="denuncia" options={{ title: 'Registrar denúncia', presentation: 'modal' }} />
        <Stack.Screen name="mapa" options={{ title: 'Selecionar no mapa' }} />
        <Stack.Screen name="acompanhar" options={{ title: 'Acompanhar protocolo' }} />
        <Stack.Screen name="servicos" options={{ title: 'Serviços' }} />
        <Stack.Screen name="navegador" options={{ title: 'Portal' }} />
        <Stack.Screen name="noticia/[slug]" options={{ title: 'Notícia' }} />
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
      <AuthProvider>
        <Navegacao />
      </AuthProvider>
    </ThemeProvider>
  );
}
