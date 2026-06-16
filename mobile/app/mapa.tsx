import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Pressable } from 'react-native';

/**
 * Mapa do cidadão. Por privacidade (DPIA), NÃO plota os chamados de terceiros
 * com coordenada exata — serve para o cidadão se situar e escolher o ponto de
 * um novo chamado. Toque/arraste o marcador e "Reportar aqui".
 */
export default function Mapa() {
  const [regiao, setRegiao] = useState<Region | null>(null);
  const [ponto, setPonto] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      const r: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegiao(r);
      setPonto({ latitude: r.latitude, longitude: r.longitude });
    })();
  }, []);

  if (!regiao) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1351b4" />
        <Text>Obtendo sua localização…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={regiao}
        onPress={(e) => setPonto(e.nativeEvent.coordinate)}
      >
        {ponto && (
          <Marker
            draggable
            coordinate={ponto}
            onDragEnd={(e) => setPonto(e.nativeEvent.coordinate)}
            title="Local do chamado"
          />
        )}
      </MapView>
      <Pressable style={styles.botao} onPress={() => router.push('/novo')}>
        <Text style={styles.botaoTexto}>Reportar aqui</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  botao: { backgroundColor: '#1351b4', padding: 16, alignItems: 'center' },
  botaoTexto: { color: '#fff', fontWeight: '700' },
});
