import { useEffect, useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Titulo, Subtitulo, Card, Btn, Campo, Aviso, SecaoTitulo } from '../components/ui';
import { Icone } from '../components/icone';
import { useTheme } from '../lib/theme';
import { CATEGORIAS } from '../lib/config';
import { criarChamado, SemRedeError } from '../lib/api';
import { enfileirar } from '../lib/fila-offline';

export default function Denuncia() {
  const { c } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ categoria?: string }>();

  const [categoria, setCategoria] = useState<string>(params.categoria ?? '');
  const [descricao, setDescricao] = useState('');
  const [fotoUri, setFotoUri] = useState<string | undefined>();
  const [anonimo, setAnonimo] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [erroLoc, setErroLoc] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState<{ protocolo: string; offline?: boolean } | null>(null);

  async function pegarLocal() {
    setErroLoc('');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setErroLoc('Permita a localização para registrar o local exato.'); return; }
    const pos = await Location.getCurrentPositionAsync({});
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }
  useEffect(() => { pegarLocal(); }, []);

  async function tirarFoto(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErro('Permissão de câmera/galeria negada.'); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!r.canceled && r.assets?.[0]) setFotoUri(r.assets[0].uri);
  }

  async function enviar() {
    if (!categoria) { setErro('Escolha a categoria.'); return; }
    if (!descricao.trim()) { setErro('Descreva o problema.'); return; }
    if (!coords) { setErro('Não foi possível obter a localização.'); return; }
    setEnviando(true); setErro('');
    const input = { categoria, descricao: descricao.trim(), lat: coords.lat, lng: coords.lng, anonimo, fotoUri };
    try {
      // offline-first: tenta enviar de verdade. Só cai na fila se for falha de REDE
      // (não usamos getNetworkStateAsync: é impreciso com VoWiFi/dual-SIM/VPN).
      const r = await criarChamado(input);
      setOk({ protocolo: r.protocolo });
    } catch (e) {
      if (e instanceof SemRedeError) {
        // sem internet de fato → guarda para reenviar quando voltar a conexão
        try { await enfileirar(input); setOk({ protocolo: '', offline: true }); }
        catch { setErro('Não foi possível salvar a denúncia. Tente novamente.'); }
      } else {
        // erro do servidor (HTTP) → mostra o motivo real em vez de fingir "offline"
        setErro(e instanceof Error ? e.message : 'Falha ao enviar. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (ok) {
    return (
      <Screen>
        <Aviso tipo="ok">
          {ok.offline
            ? 'Sem conexão agora — sua denúncia foi salva e será enviada automaticamente quando houver internet.'
            : 'Denúncia registrada com sucesso!'}
        </Aviso>
        {ok.protocolo ? (
          <Card>
            <Subtitulo>Protocolo</Subtitulo>
            <Text style={{ color: c.fg, fontSize: 22, fontWeight: '800' }}>{ok.protocolo}</Text>
          </Card>
        ) : null}
        <Btn titulo="Voltar ao início" onPress={() => router.replace('/')} />
        {ok.protocolo ? <Btn titulo="Acompanhar" variante="contorno" onPress={() => router.replace({ pathname: '/acompanhar', params: { protocolo: ok.protocolo } })} /> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <Titulo>Registrar denúncia</Titulo>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <SecaoTitulo>Categoria</SecaoTitulo>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIAS.map((cat) => {
          const ativo = categoria === cat.value;
          return (
            <Pressable key={cat.value} onPress={() => setCategoria(cat.value)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
                borderWidth: 1.5, borderColor: ativo ? c.primary : c.border, backgroundColor: ativo ? c.primary + '15' : c.card }}>
              <Icone nome={cat.icone} tamanho={16} cor={ativo ? c.primary : c.muted} />
              <Text style={{ color: ativo ? c.primary : c.fg, fontWeight: '600', fontSize: 13 }}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Campo label="Descrição" valor={descricao} onChange={setDescricao} multiline
        placeholder="Descreva o problema (local de referência, há quanto tempo…)" />

      {/* Foto */}
      <SecaoTitulo>Foto (opcional)</SecaoTitulo>
      {fotoUri ? <Image source={{ uri: fotoUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn titulo="Câmera" icone="camera-outline" variante="contorno" style={{ flex: 1 }} onPress={() => tirarFoto(true)} />
        <Btn titulo="Galeria" icone="image-multiple-outline" variante="contorno" style={{ flex: 1 }} onPress={() => tirarFoto(false)} />
      </View>

      {/* Localização */}
      <SecaoTitulo>Localização</SecaoTitulo>
      {coords ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.success + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
          <Icone nome="map-marker-check" tamanho={15} cor={c.success} />
          <Text style={{ color: c.success, fontSize: 12, fontWeight: '700' }}>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</Text>
        </View>
      ) : (
        <Btn titulo="Obter minha localização" variante="sutil" onPress={pegarLocal} />
      )}
      {erroLoc ? <Subtitulo>{erroLoc}</Subtitulo> : null}

      {/* Anônimo */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: c.fg, fontWeight: '600' }}>Enviar anonimamente</Text>
            <Subtitulo>Não vinculamos sua identidade à denúncia (LGPD).</Subtitulo>
          </View>
          <Switch value={anonimo} onValueChange={setAnonimo} trackColor={{ true: c.primary }} />
        </View>
      </Card>

      <Btn titulo="Enviar denúncia" carregando={enviando} onPress={enviar} />
      <Subtitulo>
        Sua foto sobe pela API e é tratada como dado restrito; a localização é
        usada só para registrar o local do problema.
      </Subtitulo>
    </Screen>
  );
}
