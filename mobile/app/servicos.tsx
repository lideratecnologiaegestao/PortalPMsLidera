import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Card } from '../components/ui';
import { Icone } from '../components/icone';
import { useTheme } from '../lib/theme';
import { ACESSO_RAPIDO, API_URL } from '../lib/config';

export default function Servicos() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <Titulo>Serviços</Titulo>
      <Subtitulo>Acesse os serviços do município. Os formulários completos abrem no portal.</Subtitulo>
      {ACESSO_RAPIDO.map((a) => (
        <Card key={a.path} onPress={() => router.push({ pathname: '/navegador', params: { url: `${API_URL}${a.path}`, titulo: a.titulo } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nome={a.icone} tamanho={22} cor={c.primary} />
          </View>
          <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16, flex: 1 }}>{a.titulo}</Text>
          <Icone nome="chevron-right" tamanho={22} cor={c.muted} />
        </Card>
      ))}
    </Screen>
  );
}
