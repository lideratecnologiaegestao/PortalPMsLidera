import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Screen, Titulo, Subtitulo, Card, Btn, Aviso, Vazio, Pill } from '../components/ui';
import { Icone } from '../components/icone';
import { useTheme } from '../lib/theme';
import { unidadesProximas, type UnidadeProxima } from '../lib/api';

/**
 * "Unidades perto de mim" — pega a localização do cidadão (expo-location) e
 * lista as unidades de atendimento mais próximas (PostGIS no backend). Cada
 * card abre direto no Google Maps ou no Waze.
 */

const RAIOS = [
  { v: 2000, l: '2 km' },
  { v: 5000, l: '5 km' },
  { v: 15000, l: '15 km' },
  { v: 50000, l: '50 km' },
];

function fmtDist(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function mapsUrl(u: UnidadeProxima): string {
  if (u.latitude != null && u.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${u.latitude},${u.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.endereco ?? u.nome)}`;
}
function wazeUrl(u: UnidadeProxima): string {
  if (u.latitude != null && u.longitude != null) {
    return `https://waze.com/ul?ll=${u.latitude},${u.longitude}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(u.endereco ?? u.nome)}&navigate=yes`;
}

export default function UnidadesProximas() {
  const { c } = useTheme();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState(false);
  const [lista, setLista] = useState<UnidadeProxima[]>([]);
  const [raio, setRaio] = useState(5000);

  const buscar = useCallback(async (raioM: number) => {
    setErro('');
    setCarregando(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setErro('Precisamos da sua localização para mostrar as unidades próximas. Libere o acesso nas configurações.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const dados = await unidadesProximas(pos.coords.latitude, pos.coords.longitude, raioM);
      setLista(dados);
      setFeito(true);
    } catch {
      setErro('Não foi possível buscar as unidades. Verifique sua conexão e tente novamente.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(raio); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function trocarRaio(v: number) {
    setRaio(v);
    buscar(v);
  }

  return (
    <Screen>
      <Titulo>Unidades perto de mim</Titulo>
      <Subtitulo>As unidades de atendimento mais próximas de onde você está. Toque para abrir no mapa.</Subtitulo>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {RAIOS.map((r) => {
          const ativo = r.v === raio;
          return (
            <Pressable key={r.v} onPress={() => trocarRaio(r.v)}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: ativo ? c.primary : c.border, backgroundColor: ativo ? c.primary + '18' : 'transparent' }}>
                <Text style={{ color: ativo ? c.primary : c.muted, fontWeight: '700', fontSize: 13 }}>{r.l}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Btn titulo={carregando ? 'Buscando…' : 'Atualizar com minha localização'} icone="map-marker" onPress={() => buscar(raio)} carregando={carregando} />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {!carregando && feito && lista.length === 0 && (
        <Vazio>Nenhuma unidade com localização cadastrada dentro de {fmtDist(raio)}.</Vazio>
      )}

      {lista.map((u) => (
        <Card key={u.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ color: c.fg, fontWeight: '800', fontSize: 16, flex: 1 }}>{u.nome}{u.sigla ? ` (${u.sigla})` : ''}</Text>
            <Pill texto={fmtDist(u.distanciaM)} />
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>{u.orgaoNome}</Text>
          {u.endereco ? <Text style={{ color: c.fg, fontSize: 14 }}>📍 {u.endereco}{u.cep ? ` — CEP ${u.cep}` : ''}</Text> : null}
          {u.horario ? <Text style={{ color: c.muted, fontSize: 13 }}>🕒 {u.horario}</Text> : null}
          {u.telefone ? (
            <Text style={{ color: c.primary, fontSize: 14 }} onPress={() => Linking.openURL(`tel:${u.telefone}`)}>📞 {u.telefone}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Btn titulo="Google Maps" icone="map" variante="primario" style={{ flex: 1 }} onPress={() => Linking.openURL(mapsUrl(u))} />
            <Btn titulo="Waze" icone="navigation" variante="contorno" style={{ flex: 1 }} onPress={() => Linking.openURL(wazeUrl(u))} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
