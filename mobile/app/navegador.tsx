import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../lib/theme';
import { Icone } from '../components/icone';
import { Screen, Subtitulo, Btn, Titulo } from '../components/ui';

/**
 * Navegador interno (WebView) — mantém o portal do município DENTRO do app, com
 * o cabeçalho do app, em vez de jogar o cidadão para o Chrome. PDFs/downloads e
 * esquemas externos (tel:, mailto:) abrem no navegador do sistema sob demanda.
 */
export default function Navegador() {
  const { c } = useTheme();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ url?: string; titulo?: string }>();
  const url = params.url ?? '';
  const ref = useRef<WebView>(null);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [podeVoltar, setPodeVoltar] = useState(false);
  const [urlAtual, setUrlAtual] = useState(url);

  // Título + botão "abrir no navegador" (para downloads/PDF que a WebView não exibe).
  useLayoutEffect(() => {
    navigation.setOptions({
      title: params.titulo || 'Portal',
      headerRight: () => (
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(urlAtual)}
          hitSlop={10}
          accessibilityLabel="Abrir no navegador do sistema"
        >
          <Icone nome="open-in-new" tamanho={22} cor={c.primaryFg} />
        </Pressable>
      ),
    });
  }, [navigation, params.titulo, urlAtual, c.primaryFg]);

  // Botão físico "voltar": navega dentro do site antes de sair da tela.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (podeVoltar) { ref.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [podeVoltar]);

  function onNav(s: WebViewNavigation) {
    setPodeVoltar(s.canGoBack);
    if (s.url) setUrlAtual(s.url);
  }

  // Esquemas não-http (tel:, mailto:, intent:) abrem fora; o resto fica no app.
  function permitir(req: { url: string }): boolean {
    if (/^https?:/i.test(req.url)) return true;
    Linking.openURL(req.url).catch(() => undefined);
    return false;
  }

  if (!url) {
    return (
      <Screen>
        <Titulo>Link indisponível</Titulo>
        <Subtitulo>Não foi possível abrir esta página.</Subtitulo>
      </Screen>
    );
  }

  if (erro) {
    return (
      <Screen>
        <Titulo>Não foi possível carregar</Titulo>
        <Subtitulo>A página pode exigir download ou estar fora do ar. Você pode tentar abri-la no navegador do sistema.</Subtitulo>
        <Btn titulo="Abrir no navegador" icone="open-in-new" onPress={() => WebBrowser.openBrowserAsync(url)} />
        <Btn titulo="Tentar de novo" variante="contorno" onPress={() => { setErro(false); setCarregando(true); ref.current?.reload(); }} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <WebView
        ref={ref}
        source={{ uri: url }}
        onNavigationStateChange={onNav}
        onShouldStartLoadWithRequest={permitir}
        onLoadStart={() => setCarregando(true)}
        onLoadEnd={() => setCarregando(false)}
        onError={() => { setErro(true); setCarregando(false); }}
        onHttpError={() => setCarregando(false)}
        startInLoadingState
        allowsBackForwardNavigationGestures
        style={{ flex: 1, backgroundColor: c.bg }}
      />
      {carregando && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      )}
    </View>
  );
}
