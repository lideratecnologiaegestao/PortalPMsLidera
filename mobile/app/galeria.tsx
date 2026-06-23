import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useNavigation } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../lib/theme';
import { Icone } from '../components/icone';
import { Vazio } from '../components/ui';
import { getGaleria, GaleriaItem, GaleriaTipo } from '../lib/api';

const { width: SCREEN_W } = Dimensions.get('window');
const NUM_COLS = 3;
const ITEM_SIZE = Math.floor((SCREEN_W - 32 - (NUM_COLS - 1) * 4) / NUM_COLS);
const PAGE_SIZE = 24;

// ─── Aba Fotos | Vídeos ───────────────────────────────────────────────────────

type Aba = GaleriaTipo;

interface Segmento {
  label: string;
  value: Aba;
}

const ABAS: Segmento[] = [
  { label: 'Fotos', value: 'foto' },
  { label: 'Vídeos', value: 'video' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function thumbUrl(item: GaleriaItem): string {
  if (item.fonte === 'youtube' && item.youtubeId) {
    return `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`;
  }
  return item.url;
}

function abrirVideo(item: GaleriaItem) {
  if (item.fonte === 'youtube' && item.youtubeId) {
    const url = `https://www.youtube.com/watch?v=${item.youtubeId}`;
    Linking.canOpenURL(url)
      .then((can) => (can ? Linking.openURL(url) : WebBrowser.openBrowserAsync(url)))
      .catch(() => WebBrowser.openBrowserAsync(url));
  } else {
    // MP4 via upload — abre no navegador do sistema (sem expo-av)
    Linking.openURL(item.url).catch(() => WebBrowser.openBrowserAsync(item.url));
  }
}

// ─── Lightbox (fotos) ────────────────────────────────────────────────────────

interface LightboxProps {
  itens: GaleriaItem[];
  indiceInicial: number;
  visivel: boolean;
  onFechar: () => void;
}

function Lightbox({ itens, indiceInicial, visivel, onFechar }: LightboxProps) {
  const { c } = useTheme();
  const [indice, setIndice] = useState(indiceInicial);

  // Sincroniza o índice quando o lightbox abre
  useEffect(() => {
    if (visivel) setIndice(indiceInicial);
  }, [visivel, indiceInicial]);

  const irAnterior = () => setIndice((i) => Math.max(0, i - 1));
  const irProximo = () => setIndice((i) => Math.min(itens.length - 1, i + 1));

  const item = itens[indice];
  if (!item) return null;

  return (
    <Modal
      visible={visivel}
      transparent
      animationType="fade"
      onRequestClose={onFechar}
      statusBarTranslucent
    >
      <View
        style={{ flex: 1, backgroundColor: '#000000ee', alignItems: 'center', justifyContent: 'center' }}
        accessibilityViewIsModal
        accessibilityLabel="Visualizador de imagem"
      >
        {/* Fechar */}
        <Pressable
          onPress={onFechar}
          accessibilityLabel="Fechar visualizador"
          accessibilityRole="button"
          style={{ position: 'absolute', top: 44, right: 16, zIndex: 10, padding: 8 }}
          hitSlop={12}
        >
          <Icone nome="close" tamanho={28} cor="#ffffff" />
        </Pressable>

        {/* Contador */}
        <Text
          style={{ position: 'absolute', top: 52, left: 0, right: 0, textAlign: 'center', color: '#ffffffaa', fontSize: 13 }}
          accessibilityLabel={`Foto ${indice + 1} de ${itens.length}`}
        >
          {indice + 1} / {itens.length}
        </Text>

        {/* Imagem principal */}
        <Image
          source={{ uri: thumbUrl(item) }}
          style={{ width: SCREEN_W, height: SCREEN_W, resizeMode: 'contain' }}
          accessibilityLabel={item.titulo || 'Imagem da galeria'}
        />

        {/* Título */}
        {item.titulo ? (
          <Text
            style={{ position: 'absolute', bottom: 60, left: 16, right: 16, color: '#ffffffcc', fontSize: 14, textAlign: 'center' }}
            numberOfLines={2}
          >
            {item.titulo}
          </Text>
        ) : null}

        {/* Navegação anterior/próxima */}
        {indice > 0 && (
          <Pressable
            onPress={irAnterior}
            accessibilityLabel="Foto anterior"
            accessibilityRole="button"
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 64, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 10 }}
            hitSlop={8}
          >
            <View style={{ backgroundColor: '#00000066', borderRadius: 24, padding: 6 }}>
              <Icone nome="chevron-left" tamanho={32} cor="#ffffff" />
            </View>
          </Pressable>
        )}
        {indice < itens.length - 1 && (
          <Pressable
            onPress={irProximo}
            accessibilityLabel="Próxima foto"
            accessibilityRole="button"
            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 64, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10 }}
            hitSlop={8}
          >
            <View style={{ backgroundColor: '#00000066', borderRadius: 24, padding: 6 }}>
              <Icone nome="chevron-right" tamanho={32} cor="#ffffff" />
            </View>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

// ─── Grid de itens ────────────────────────────────────────────────────────────

interface GridItemProps {
  item: GaleriaItem;
  onPress: () => void;
}

function GridItem({ item, onPress }: GridItemProps) {
  const { c } = useTheme();
  const thumb = thumbUrl(item);
  const ehVideo = item.tipo === 'video';

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={item.titulo || (ehVideo ? 'Vídeo da galeria' : 'Foto da galeria')}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          width: ITEM_SIZE,
          height: ITEM_SIZE,
          margin: 2,
          borderRadius: 6,
          overflow: 'hidden',
          backgroundColor: c.muted + '22',
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Image
        source={{ uri: thumb }}
        style={{ width: '100%', height: '100%' }}
        accessibilityLabel=""
        resizeMode="cover"
      />
      {/* Sobreposição de play para vídeo */}
      {ehVideo && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#00000044',
          }}
          pointerEvents="none"
        >
          <View style={{ backgroundColor: '#00000077', borderRadius: 24, padding: 6 }}>
            <Icone nome="play-circle-outline" tamanho={36} cor="#ffffff" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function Galeria() {
  const { c } = useTheme();
  const navigation = useNavigation();

  const [aba, setAba] = useState<Aba>('foto');
  const [itens, setItens] = useState<GaleriaItem[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lightboxIndice, setLightboxIndice] = useState(0);
  const [lightboxVisivel, setLightboxVisivel] = useState(false);

  // Previne chamadas duplas no onEndReached
  const buscandoRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Galeria' });
  }, [navigation]);

  const buscar = useCallback(async (tipo: Aba, pag: number, acumular: boolean) => {
    if (buscandoRef.current) return;
    buscandoRef.current = true;
    acumular ? setCarregandoMais(true) : setCarregando(true);
    setErro(null);
    try {
      const resp = await getGaleria(tipo, pag, PAGE_SIZE);
      setItens((prev) => (acumular ? [...prev, ...resp.items] : resp.items));
      setTotal(resp.total);
      setPagina(pag);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a galeria.');
    } finally {
      acumular ? setCarregandoMais(false) : setCarregando(false);
      buscandoRef.current = false;
    }
  }, []);

  // Reseta e recarrega ao trocar de aba
  useEffect(() => {
    setItens([]);
    setPagina(1);
    setTotal(0);
    buscar(aba, 1, false);
  }, [aba, buscar]);

  function carregarMais() {
    if (carregandoMais || itens.length >= total) return;
    buscar(aba, pagina + 1, true);
  }

  function abrirItem(item: GaleriaItem, indice: number) {
    if (item.tipo === 'video') {
      abrirVideo(item);
    } else {
      // foto — lightbox nativo
      setLightboxIndice(indice);
      setLightboxVisivel(true);
    }
  }

  const temMais = itens.length < total;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Segmento Fotos | Vídeos */}
      <View
        style={{
          flexDirection: 'row',
          margin: 16,
          backgroundColor: c.card,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: c.border,
          overflow: 'hidden',
        }}
        accessibilityRole="tablist"
      >
        {ABAS.map((a) => {
          const ativa = aba === a.value;
          return (
            <Pressable
              key={a.value}
              onPress={() => setAba(a.value)}
              accessibilityRole="tab"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: ativa }}
              style={({ pressed }) => [
                {
                  flex: 1,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: ativa ? c.primary : 'transparent',
                  minHeight: 44,
                  justifyContent: 'center',
                },
                pressed && !ativa && { opacity: 0.7 },
              ]}
            >
              <Text
                style={{
                  fontWeight: '700',
                  fontSize: 14,
                  color: ativa ? c.primaryFg : c.fg,
                }}
              >
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Conteúdo */}
      {carregando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} accessibilityLabel="Carregando galeria" />
        </View>
      ) : erro ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Icone nome="alert-circle-outline" tamanho={40} cor={c.danger} />
          <Text style={{ color: c.danger, marginTop: 10, textAlign: 'center' }}>{erro}</Text>
          <Pressable
            onPress={() => buscar(aba, 1, false)}
            accessibilityLabel="Tentar novamente"
            accessibilityRole="button"
            style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: c.primary, borderRadius: 10, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: c.primaryFg, fontWeight: '700' }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLS}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
          columnWrapperStyle={{ justifyContent: 'flex-start' }}
          refreshControl={
            <RefreshControl
              refreshing={carregando}
              onRefresh={() => buscar(aba, 1, false)}
              tintColor={c.primary}
              accessibilityLabel="Atualizar galeria"
            />
          }
          onEndReached={carregarMais}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Vazio>
              {aba === 'foto' ? 'Nenhuma foto publicada.' : 'Nenhum vídeo publicado.'}
            </Vazio>
          }
          ListFooterComponent={
            carregandoMais ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={c.primary} accessibilityLabel="Carregando mais itens" />
              </View>
            ) : temMais ? (
              <Pressable
                onPress={carregarMais}
                accessibilityLabel="Carregar mais"
                accessibilityRole="button"
                style={{ margin: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: c.primary, fontWeight: '600' }}>Carregar mais</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item, index }) => (
            <GridItem item={item} onPress={() => abrirItem(item, index)} />
          )}
        />
      )}

      {/* Lightbox — apenas fotos */}
      <Lightbox
        itens={itens.filter((i) => i.tipo !== 'video')}
        indiceInicial={lightboxIndice}
        visivel={lightboxVisivel}
        onFechar={() => setLightboxVisivel(false)}
      />
    </View>
  );
}
