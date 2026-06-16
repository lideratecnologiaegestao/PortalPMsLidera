import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Titulo, Subtitulo, Pill, Vazio } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { API_URL } from '../../lib/config';
import { getNoticia, NoticiaDetalhe } from '../../lib/api';

export default function NoticiaDetalheScreen() {
  const { c } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [n, setN] = useState<NoticiaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!slug) return;
    getNoticia(slug).then(setN).finally(() => setCarregando(false));
  }, [slug]);

  if (carregando) return <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  if (!n) return <Screen><Vazio>Notícia não encontrada.</Vazio></Screen>;

  const corpo = n.conteudo ?? n.corpo ?? n.resumo ?? '';
  return (
    <Screen>
      {n.imagemUrl ? (
        <Image source={{ uri: n.imagemUrl.startsWith('http') ? n.imagemUrl : `${API_URL}${n.imagemUrl}` }} style={{ width: '100%', height: 200, borderRadius: 12, backgroundColor: c.muted + '22' }} />
      ) : null}
      {n.categoria ? <Pill texto={n.categoria} /> : null}
      <Titulo>{n.titulo}</Titulo>
      {n.publicadoEm ? <Subtitulo>{new Date(n.publicadoEm).toLocaleDateString('pt-BR')}</Subtitulo> : null}
      <Text style={{ color: c.fg, fontSize: 15, lineHeight: 23 }}>{corpo.replace(/<[^>]+>/g, '')}</Text>
    </Screen>
  );
}
