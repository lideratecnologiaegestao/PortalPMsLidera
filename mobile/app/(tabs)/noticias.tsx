import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Pill, Vazio } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { API_URL } from '../../lib/config';
import { getNoticias, NoticiaItem } from '../../lib/api';

export default function Noticias() {
  const { c } = useTheme();
  const router = useRouter();
  const [itens, setItens] = useState<NoticiaItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = () => { setCarregando(true); getNoticias(20).then(setItens).finally(() => setCarregando(false)); };
  useEffect(carregar, []);

  if (carregando && itens.length === 0) {
    return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={itens}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} tintColor={c.primary} />}
      ListEmptyComponent={<Vazio>Nenhuma notícia publicada.</Vazio>}
      renderItem={({ item: n }) => (
        <Pressable
          onPress={() => router.push(`/noticia/${n.slug}`)}
          style={({ pressed }) => [
            { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
            pressed && { opacity: 0.9 },
          ]}
        >
          {n.imagemUrl ? (
            <Image source={{ uri: n.imagemUrl.startsWith('http') ? n.imagemUrl : `${API_URL}${n.imagemUrl}` }} style={{ width: '100%', height: 150, backgroundColor: c.muted + '22' }} />
          ) : null}
          <View style={{ padding: 12, gap: 6 }}>
            {n.categoria ? <Pill texto={n.categoria} /> : null}
            <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16 }} numberOfLines={2}>{n.titulo}</Text>
            {n.resumo ? <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>{n.resumo}</Text> : null}
            {n.publicadoEm ? <Text style={{ color: c.muted, fontSize: 11 }}>{new Date(n.publicadoEm).toLocaleDateString('pt-BR')}</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}
