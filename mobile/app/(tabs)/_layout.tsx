import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { useAppConfig } from '../../lib/appConfig';
import { naoLidasNotif } from '../../lib/api';
import { Icone, NomeIcone } from '../../components/icone';

const TabIcone = (nome: NomeIcone) => ({ color }: { color: string }) => <Icone nome={nome} tamanho={24} cor={color} />;

export default function TabsLayout() {
  const { c, portal } = useTheme();
  const { token } = useAuth();
  const { config } = useAppConfig();
  const titulo = portal.nome || config.appName || 'Portal do Cidadão';
  const [avisos, setAvisos] = useState(0);

  useEffect(() => {
    if (!token) { setAvisos(0); return; }
    const buscar = () => naoLidasNotif(token).then(setAvisos).catch(() => undefined);
    buscar();
    const id = setInterval(buscar, 30000);
    return () => clearInterval(id);
  }, [token]);

  // Módulos da config (já vêm com defaults — nunca undefined).
  const mod = config.modulos;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: c.primaryFg,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 60, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Home — sempre visível */}
      <Tabs.Screen
        name="index"
        options={{ title: titulo, tabBarLabel: 'Início', tabBarIcon: TabIcone('home-variant-outline') }}
      />

      {/* Notícias — oculta se módulo desabilitado */}
      <Tabs.Screen
        name="noticias"
        options={{
          title: 'Notícias',
          tabBarIcon: TabIcone('newspaper-variant-outline'),
          ...(mod.noticias ? {} : { href: null }),
        }}
      />

      {/* Avisos (notificações in-app) — sempre visível para quem está logado */}
      <Tabs.Screen
        name="avisos"
        options={{
          title: 'Avisos',
          tabBarIcon: TabIcone('bell-outline'),
          tabBarBadge: avisos > 0 ? avisos : undefined,
        }}
      />

      {/* Painel do usuário — sempre visível (Home e Conta são mínimos garantidos) */}
      <Tabs.Screen
        name="painel"
        options={{ title: 'Meu painel', tabBarLabel: 'Painel', tabBarIcon: TabIcone('account-outline') }}
      />

      {/* Ajustes — sempre visível */}
      <Tabs.Screen
        name="config"
        options={{ title: 'Ajustes', tabBarIcon: TabIcone('cog-outline') }}
      />
    </Tabs>
  );
}
