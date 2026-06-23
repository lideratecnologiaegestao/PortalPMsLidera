import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Titulo, SecaoTitulo, Card, Subtitulo, Pill } from '../../components/ui';
import { Icone } from '../../components/icone';
import { useTheme } from '../../lib/theme';
import { useAppConfig } from '../../lib/appConfig';
import { API_URL } from '../../lib/config';
import { getNoticias, NoticiaItem } from '../../lib/api';
import { sincronizar } from '../../lib/fila-offline';

/**
 * Rotas consideradas "nativas" no acesso rápido:
 * em vez de abrir no WebView, abrem uma tela nativa do app.
 * Os demais paths abrem no navegador interno (editorial/documental).
 */
const ROTAS_NATIVAS: Record<string, string> = {
  '/denuncia': '/denuncia',
  '/acompanhar': '/acompanhar',
  '/ouvidoria': '/acompanhar',   // acompanhar cobre ouvidoria + esic
  '/esic': '/acompanhar',
  '/galeria': '/galeria',
  '/documentos': '/documentos',
};

export default function Inicio() {
  const { c, portal } = useTheme();
  const { config } = useAppConfig();
  const router = useRouter();
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [pendentes, setPendentes] = useState(0);

  const { modulos, acessoRapido, categoriasChamados } = config;

  useEffect(() => {
    sincronizar().then(setPendentes).catch(() => undefined);
    if (modulos.noticias) {
      getNoticias(4).then(setNoticias).catch(() => undefined);
    }
  }, [modulos.noticias]);

  function abrirAtalho(path: string, titulo: string) {
    const rotaNativa = ROTAS_NATIVAS[path];
    if (rotaNativa) {
      router.push(rotaNativa as Parameters<typeof router.push>[0]);
    } else {
      // Conteúdo editorial/documental → WebView interno.
      router.push({ pathname: '/navegador', params: { url: `${API_URL}${path}`, titulo } });
    }
  }

  const nomePrefeitura = portal.nome || config.appName;

  return (
    <Screen>
      {/* Saudação */}
      <View style={{ gap: 2 }}>
        <Subtitulo>Bem-vindo ao app da</Subtitulo>
        <Titulo>{nomePrefeitura}{portal.uf ? ` · ${portal.uf}` : ''}</Titulo>
      </View>

      {pendentes > 0 && (
        <Pill texto={`${pendentes} denúncia(s) enviada(s) ao reconectar`} cor={c.success} />
      )}

      {/* CTA principal: registrar denúncia (só se módulo habilitado) */}
      {modulos.denuncia && (
        <Card
          onPress={() => router.push('/denuncia')}
          style={{ backgroundColor: c.primary, borderColor: c.primary, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nome="camera-plus-outline" tamanho={28} cor={c.primaryFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.primaryFg, fontSize: 18, fontWeight: '800' }}>Registrar denúncia</Text>
            <Text style={{ color: c.primaryFg, opacity: 0.9, marginTop: 2 }}>
              Buraco, lixo, iluminação… com foto e localização. Pode ser anônima.
            </Text>
          </View>
        </Card>
      )}

      {/* Categorias de chamado (só se denúncia habilitada) */}
      {modulos.denuncia && categoriasChamados.length > 0 && (
        <>
          <SecaoTitulo>O que você quer reportar?</SecaoTitulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {categoriasChamados.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => router.push({ pathname: '/denuncia', params: { categoria: cat.value } })}
                accessibilityLabel={`Registrar denúncia: ${cat.label}`}
                accessibilityRole="button"
                style={({ pressed }) => [
                  { width: '47%', alignItems: 'center', backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 8, gap: 10 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <Icone nome={cat.icone} tamanho={30} cor={c.primary} />
                </View>
                <Text style={{ color: c.fg, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Acompanhar protocolo — sempre visível (fluxo nativo) */}
      <Card
        onPress={() => router.push('/acompanhar')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icone nome="magnify" tamanho={24} cor={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontWeight: '700' }}>Acompanhar protocolo</Text>
          <Subtitulo>Consulte o andamento da sua denúncia ou manifestação.</Subtitulo>
        </View>
      </Card>

      {/* Galeria — atalho nativo (só se módulo habilitado) */}
      {modulos.galeria && (
        <Card
          onPress={() => router.push('/galeria')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nome="image-multiple-outline" tamanho={24} cor={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.fg, fontWeight: '700' }}>Galeria</Text>
            <Subtitulo>Fotos e vídeos do município.</Subtitulo>
          </View>
          <Icone nome="chevron-right" tamanho={20} cor={c.muted} />
        </Card>
      )}

      {/* Documentos — atalho nativo (só se módulo habilitado) */}
      {modulos.documentos && (
        <Card
          onPress={() => router.push('/documentos')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nome="file-document-multiple-outline" tamanho={24} cor={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.fg, fontWeight: '700' }}>Documentos oficiais</Text>
            <Subtitulo>Leis, decretos e atos normativos.</Subtitulo>
          </View>
          <Icone nome="chevron-right" tamanho={20} cor={c.muted} />
        </Card>
      )}

      {/* Acesso rápido */}
      {acessoRapido.length > 0 && (
        <>
          <SecaoTitulo>Acesso rápido</SecaoTitulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {acessoRapido.map((a) => (
              <Pressable
                key={a.path}
                onPress={() => abrirAtalho(a.path, a.titulo)}
                accessibilityLabel={a.titulo}
                accessibilityRole="button"
                style={({ pressed }) => [
                  { width: '30%', alignItems: 'center', gap: 8, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Icone nome={a.icone} tamanho={26} cor={c.primary} />
                <Text style={{ color: c.fg, fontSize: 11, textAlign: 'center' }}>{a.titulo}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Notícias (só se módulo habilitado) */}
      {modulos.noticias && noticias.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SecaoTitulo>Últimas notícias</SecaoTitulo>
            <Pressable
              onPress={() => router.push('/noticias')}
              accessibilityLabel="Ver todas as notícias"
              accessibilityRole="link"
            >
              <Text style={{ color: c.primary, fontWeight: '600' }}>Ver todas</Text>
            </Pressable>
          </View>
          {noticias.slice(0, 3).map((n) => (
            <Card key={n.id} onPress={() => router.push(`/noticia/${n.slug}`)}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {n.imagemUrl ? (
                  <Image
                    source={{ uri: n.imagemUrl.startsWith('http') ? n.imagemUrl : `${API_URL}${n.imagemUrl}` }}
                    style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.muted + '22' }}
                    accessibilityLabel=""
                  />
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  {n.categoria ? <Pill texto={n.categoria} /> : null}
                  <Text style={{ color: c.fg, fontWeight: '600' }} numberOfLines={2}>{n.titulo}</Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
