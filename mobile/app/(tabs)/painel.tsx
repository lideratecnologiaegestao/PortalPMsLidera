import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Card, Btn, SecaoTitulo, Pill, Vazio } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { API_URL, STATUS_LABEL } from '../../lib/config';
import { estatisticasOuvidoria } from '../../lib/api';

interface Minha { id: string; protocolo: string; canal: string; assunto: string; status: string; criadoEm: string }

function Kpi({ valor, label }: { valor: string; label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
      <Text style={{ color: c.primary, fontSize: 22, fontWeight: '800' }}>{valor}</Text>
      <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

export default function Painel() {
  const { c } = useTheme();
  const router = useRouter();
  const { token, usuario, sair } = useAuth();
  const [est, setEst] = useState<{ total: number; taxaNoPrazo: number | null; tempoMedioDias: number | null; abertos: number } | null>(null);
  const [minhas, setMinhas] = useState<Minha[]>([]);

  useEffect(() => { estatisticasOuvidoria().then(setEst).catch(() => undefined); }, []);
  useEffect(() => {
    if (!token) { setMinhas([]); return; }
    fetch(`${API_URL}/api/manifestacoes/minhas`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setMinhas)
      .catch(() => undefined);
  }, [token]);

  return (
    <Screen>
      <Titulo>{token && usuario ? `Olá, ${usuario.nome.split(' ')[0]}` : 'Meu painel'}</Titulo>

      <View style={{ gap: 10 }}>
        <Btn titulo="Registrar denúncia" icone="camera-plus-outline" onPress={() => router.push('/denuncia')} />
        <Btn titulo="Acompanhar por protocolo" icone="magnify" variante="contorno" onPress={() => router.push('/acompanhar')} />
      </View>

      {/* Conta */}
      {!token ? (
        <Card>
          <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16 }}>Crie sua conta</Text>
          <Subtitulo>
            Com uma conta você acompanha todas as suas manifestações em um só lugar
            e recebe avisos. O cadastro é rápido (e-mail + WhatsApp) — sem precisar do gov.br.
          </Subtitulo>
          <View style={{ gap: 8, marginTop: 10 }}>
            <Btn titulo="Criar conta" onPress={() => router.push('/conta/cadastro')} />
            <Btn titulo="Já tenho conta — Entrar" variante="contorno" onPress={() => router.push('/conta/login')} />
          </View>
        </Card>
      ) : (
        <>
          <SecaoTitulo>Minhas manifestações</SecaoTitulo>
          {minhas.length === 0 ? <Vazio>Você ainda não tem manifestações.</Vazio> : minhas.map((m) => (
            <Card key={m.id} onPress={() => router.push({ pathname: '/acompanhar', params: { protocolo: m.protocolo } })}>
              <Pill texto={STATUS_LABEL[m.status] ?? m.status} />
              <Text style={{ color: c.fg, fontWeight: '600', marginTop: 4 }}>{m.assunto}</Text>
              <Subtitulo>{m.canal === 'esic' ? 'e-SIC' : 'Ouvidoria'} · {m.protocolo}</Subtitulo>
            </Card>
          ))}
          <Btn titulo="Sair da conta" variante="sutil" onPress={sair} />
        </>
      )}

      {/* Indicadores */}
      <SecaoTitulo>Atendimento da Ouvidoria</SecaoTitulo>
      {est && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Kpi valor={String(est.total)} label="Manifestações" />
          <Kpi valor={est.taxaNoPrazo != null ? `${est.taxaNoPrazo}%` : '—'} label="No prazo" />
          <Kpi valor={est.tempoMedioDias != null ? `${est.tempoMedioDias}d` : '—'} label="Tempo médio" />
        </View>
      )}
    </Screen>
  );
}
