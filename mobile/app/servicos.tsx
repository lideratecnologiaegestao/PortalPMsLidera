import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Card } from '../components/ui';
import { Icone } from '../components/icone';
import { useTheme } from '../lib/theme';
import { useAppConfig } from '../lib/appConfig';
import { API_URL } from '../lib/config';

/**
 * Paths que têm telas nativas no app — NÃO devem abrir no WebView.
 * Mapeamos para a rota interna correspondente.
 */
const ROTAS_NATIVAS: Record<string, string> = {
  '/denuncia': '/denuncia',
  '/acompanhar': '/acompanhar',
  '/ouvidoria': '/acompanhar',
  '/esic': '/acompanhar',
};

/**
 * Identificadores de conteúdo EDITORIAL (privacidade, diário, documentos):
 * estes abrem no WebView mesmo que tenham tela própria, pois são conteúdo
 * gerenciado pelo município sem tela nativa dedicada.
 */
const PREFIXOS_EDITORIAL = ['/privacidade', '/diario', '/documentos', '/transparencia', '/noticias'];

function ehEditorial(path: string): boolean {
  return PREFIXOS_EDITORIAL.some((p) => path.startsWith(p));
}

export default function Servicos() {
  const { c } = useTheme();
  const router = useRouter();
  const { config } = useAppConfig();

  // Usa acessoRapido da config (que já tem fallback para os defaults).
  const itens = config.acessoRapido;

  function abrirItem(path: string, titulo: string) {
    const rotaNativa = ROTAS_NATIVAS[path];
    if (rotaNativa) {
      // Fluxo do cidadão → tela nativa (nunca WebView).
      router.push(rotaNativa as Parameters<typeof router.push>[0]);
      return;
    }
    // Conteúdo editorial/portal municipal → WebView interno.
    router.push({ pathname: '/navegador', params: { url: `${API_URL}${path}`, titulo } });
  }

  return (
    <Screen>
      <Titulo>Serviços</Titulo>
      <Subtitulo>
        Acesse os serviços do município. Formulários completos abrem no portal; ações
        do cidadão (denúncia, acompanhar) abrem direto no app.
      </Subtitulo>

      <Card
        onPress={() => router.push('/unidades-proximas')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icone nome="map-marker-radius" tamanho={22} cor={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16 }}>Unidades perto de mim</Text>
          <Text style={{ color: c.muted, fontSize: 11, marginTop: 1 }}>Disponível no app</Text>
        </View>
        <Icone nome="chevron-right" tamanho={20} cor={c.muted} />
      </Card>

      {itens.map((a) => {
        const isNativo = Boolean(ROTAS_NATIVAS[a.path]);
        return (
          <Card
            key={a.path}
            onPress={() => abrirItem(a.path, a.titulo)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
          >
            <View
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icone nome={a.icone} tamanho={22} cor={c.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16 }}>{a.titulo}</Text>
              {isNativo && (
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 1 }}>Disponível no app</Text>
              )}
            </View>
            <Icone nome={isNativo ? 'chevron-right' : 'open-in-app'} tamanho={20} cor={c.muted} />
          </Card>
        );
      })}
    </Screen>
  );
}
