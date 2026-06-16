import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Screen, Titulo, SecaoTitulo, Card, Subtitulo } from '../../components/ui';
import { Icone, NomeIcone } from '../../components/icone';
import { ModoTema, useTheme } from '../../lib/theme';
import { API_URL } from '../../lib/config';

const MODOS: { v: ModoTema; label: string; icone: NomeIcone }[] = [
  { v: 'claro', label: 'Claro', icone: 'white-balance-sunny' },
  { v: 'escuro', label: 'Escuro', icone: 'moon-waning-crescent' },
  { v: 'auto', label: 'Automático', icone: 'theme-light-dark' },
];

export default function Config() {
  const { c, modo, setModo, portal } = useTheme();
  const router = useRouter();
  const abrir = (path: string, titulo: string) =>
    router.push({ pathname: '/navegador', params: { url: `${API_URL}${path}`, titulo } });

  return (
    <Screen>
      <Titulo>Ajustes</Titulo>

      <SecaoTitulo>Aparência</SecaoTitulo>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {MODOS.map((m) => {
          const ativo = modo === m.v;
          return (
            <Pressable
              key={m.v}
              onPress={() => setModo(m.v)}
              style={{
                flex: 1, alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 12,
                borderWidth: 1.5, borderColor: ativo ? c.primary : c.border,
                backgroundColor: ativo ? c.primary + '15' : c.card,
              }}
            >
              <Icone nome={m.icone} tamanho={22} cor={ativo ? c.primary : c.fg} />
              <Text style={{ color: ativo ? c.primary : c.fg, fontWeight: '600' }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SecaoTitulo>Privacidade</SecaoTitulo>
      <Card onPress={() => abrir('/privacidade', 'Privacidade')}>
        <Text style={{ color: c.fg, fontWeight: '600' }}>Política de Privacidade (LGPD)</Text>
        <Subtitulo>Suas fotos e localização são tratadas como dados restritos.</Subtitulo>
      </Card>
      <Card onPress={() => abrir('/acessibilidade', 'Acessibilidade')}>
        <Text style={{ color: c.fg, fontWeight: '600' }}>Acessibilidade</Text>
        <Subtitulo>Compromisso com WCAG 2.1 AA / eMAG.</Subtitulo>
      </Card>

      <SecaoTitulo>Sobre</SecaoTitulo>
      <Card>
        <Text style={{ color: c.fg, fontWeight: '600' }}>{portal.nome}</Text>
        <Subtitulo>App do Cidadão · versão {Constants.expoConfig?.version ?? '—'}</Subtitulo>
        <Subtitulo>O app fala somente com a API oficial do município.</Subtitulo>
      </Card>
    </Screen>
  );
}
