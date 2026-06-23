import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '../lib/theme';
import { useAppConfig } from '../lib/appConfig';
import { Btn } from '../components/ui';

export const ONBOARDING_VISTO_KEY = 'onboarding_visto';

const { width: LARGURA } = Dimensions.get('window');

interface Slide {
  titulo: string;
  descricao: string;
  imagemUrl: string;
}

function SlideItem({ item, c }: { item: Slide; c: ReturnType<typeof useTheme>['c'] }) {
  return (
    <View
      style={{
        width: LARGURA,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 20,
      }}
      accessibilityRole="none"
    >
      {item.imagemUrl ? (
        <Image
          source={{ uri: item.imagemUrl }}
          style={{ width: LARGURA * 0.65, height: LARGURA * 0.65, borderRadius: 16 }}
          accessibilityLabel=""
          resizeMode="contain"
        />
      ) : (
        <View
          style={{ width: LARGURA * 0.65, height: LARGURA * 0.65, borderRadius: 16, backgroundColor: c.primary + '14' }}
        />
      )}
      <Text
        style={{ color: c.fg, fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 30 }}
        accessibilityRole="header"
      >
        {item.titulo}
      </Text>
      <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        {item.descricao}
      </Text>
    </View>
  );
}

export default function Onboarding() {
  const { c } = useTheme();
  const { config } = useAppConfig();
  const router = useRouter();
  const ref = useRef<FlatList<Slide>>(null);
  const [indice, setIndice] = useState(0);

  const slides = config.onboarding.slides;
  const ultimo = indice === slides.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index != null) {
        setIndice(viewableItems[0].index);
      }
    },
  );

  async function concluir() {
    await AsyncStorage.setItem(ONBOARDING_VISTO_KEY, '1');
    router.replace('/(tabs)');
  }

  function avancar() {
    if (ultimo) { concluir(); return; }
    ref.current?.scrollToIndex({ index: indice + 1, animated: true });
  }

  if (slides.length === 0) {
    // Guarda de segurança: se chegou aqui sem slides, conclui imediatamente.
    concluir();
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Botão pular (aparece em todos exceto o último) */}
      <View style={{ alignItems: 'flex-end', paddingTop: 52, paddingHorizontal: 20 }}>
        {!ultimo && (
          <Pressable
            onPress={concluir}
            hitSlop={12}
            accessibilityLabel="Pular apresentação"
            accessibilityRole="button"
          >
            <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}>Pular</Text>
          </Pressable>
        )}
      </View>

      {/* Carrossel */}
      <FlatList
        ref={ref}
        data={slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => <SlideItem item={item} c={c} />}
        style={{ flex: 1 }}
        accessibilityRole="none"
      />

      {/* Indicadores de página */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === indice ? 20 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: i === indice ? c.primary : c.border,
            }}
            accessibilityLabel={`Slide ${i + 1} de ${slides.length}${i === indice ? ', atual' : ''}`}
          />
        ))}
      </View>

      {/* Botão de ação */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Btn
          titulo={ultimo ? 'Começar' : 'Próximo'}
          onPress={avancar}
          icone={ultimo ? 'check' : 'arrow-right'}
          accessibilityLabel={ultimo ? 'Começar a usar o app' : 'Próximo slide'}
        />
      </View>
    </View>
  );
}
