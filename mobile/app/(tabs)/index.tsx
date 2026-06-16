import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Titulo, SecaoTitulo, Card, Subtitulo, Pill } from '../../components/ui';
import { Icone } from '../../components/icone';
import { useTheme } from '../../lib/theme';
import { ACESSO_RAPIDO, API_URL, CATEGORIAS } from '../../lib/config';
import { getNoticias, NoticiaItem } from '../../lib/api';
import { sincronizar } from '../../lib/fila-offline';

export default function Inicio() {
  const { c, portal } = useTheme();
  const router = useRouter();
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    // push é registrado no _layout (precisa do token do usuário)
    sincronizar().then(setPendentes).catch(() => undefined);
    getNoticias(4).then(setNoticias).catch(() => undefined);
  }, []);

  const abrirWeb = (path: string, titulo: string) =>
    router.push({ pathname: '/navegador', params: { url: `${API_URL}${path}`, titulo } });

  return (
    <Screen>
      {/* Saudação */}
      <View style={{ gap: 2 }}>
        <Subtitulo>Bem-vindo ao app da</Subtitulo>
        <Titulo>{portal.nome}{portal.uf ? ` · ${portal.uf}` : ''}</Titulo>
      </View>

      {pendentes > 0 && <Pill texto={`${pendentes} denúncia(s) enviada(s) ao reconectar`} cor={c.success} />}

      {/* CTA principal: registrar denúncia */}
      <Card onPress={() => router.push('/denuncia')} style={{ backgroundColor: c.primary, borderColor: c.primary, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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

      {/* Categorias */}
      <SecaoTitulo>O que você quer reportar?</SecaoTitulo>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {CATEGORIAS.map((cat) => (
          <Pressable
            key={cat.value}
            onPress={() => router.push({ pathname: '/denuncia', params: { categoria: cat.value } })}
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

      {/* Acompanhar */}
      <Card onPress={() => router.push('/acompanhar')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icone nome="magnify" tamanho={24} cor={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.fg, fontWeight: '700' }}>Acompanhar protocolo</Text>
          <Subtitulo>Consulte o andamento da sua denúncia ou manifestação.</Subtitulo>
        </View>
      </Card>

      {/* Acesso rápido (portal web) */}
      <SecaoTitulo>Acesso rápido</SecaoTitulo>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ACESSO_RAPIDO.map((a) => (
          <Pressable
            key={a.path}
            onPress={() => abrirWeb(a.path, a.titulo)}
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

      {/* Notícias */}
      {noticias.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SecaoTitulo>Últimas notícias</SecaoTitulo>
            <Pressable onPress={() => router.push('/noticias')}><Text style={{ color: c.primary, fontWeight: '600' }}>Ver todas</Text></Pressable>
          </View>
          {noticias.slice(0, 3).map((n) => (
            <Card key={n.id} onPress={() => router.push(`/noticia/${n.slug}`)}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {n.imagemUrl ? (
                  <Image source={{ uri: n.imagemUrl.startsWith('http') ? n.imagemUrl : `${API_URL}${n.imagemUrl}` }} style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: c.muted + '22' }} />
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
