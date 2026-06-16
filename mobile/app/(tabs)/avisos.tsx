import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Card, Btn, Vazio } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { Aviso, getNotificacoes, marcarLidasNotif } from '../../lib/api';

function quando(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Avisos() {
  const { c } = useTheme();
  const router = useRouter();
  const { token } = useAuth();
  const [itens, setItens] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const r = await getNotificacoes(token);
      setItens(r.items);
      if (r.naoLidas > 0) marcarLidasNotif(token); // limpa o badge ao visualizar
    } finally { setCarregando(false); }
  }, [token]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (!token) {
    return (
      <Screen>
        <Titulo>Avisos</Titulo>
        <Card>
          <Subtitulo>Entre na sua conta para receber e ver os avisos das suas manifestações.</Subtitulo>
          <Btn titulo="Entrar / Criar conta" onPress={() => router.push('/conta/login')} style={{ marginTop: 10 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={itens}
      keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={c.primary} />}
      ListHeaderComponent={<Text style={{ color: c.fg, fontSize: 20, fontWeight: '800', marginBottom: 4 }}>Avisos</Text>}
      ListEmptyComponent={<Vazio>Você não tem avisos por enquanto.</Vazio>}
      renderItem={({ item: a }) => (
        <Card onPress={a.protocolo ? () => router.push({ pathname: '/acompanhar', params: { protocolo: a.protocolo! } }) : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!a.lida && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />}
            <Text style={{ color: c.fg, fontWeight: '700', flex: 1 }}>{a.titulo}</Text>
            <Text style={{ color: c.muted, fontSize: 11 }}>{quando(a.criadoEm)}</Text>
          </View>
          {a.corpo ? <Subtitulo>{a.corpo}</Subtitulo> : null}
        </Card>
      )}
    />
  );
}
