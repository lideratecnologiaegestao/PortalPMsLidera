import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Screen, Titulo, Subtitulo, Campo, Btn, Aviso } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { API_URL } from '../../lib/config';

export default function Login() {
  const { c } = useTheme();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro(''); setCarregando(true);
    try {
      await login(email.trim(), senha);
      router.replace('/painel');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao entrar.';
      setErro(msg);
      if (/confirme seu e-mail/i.test(msg)) router.push({ pathname: '/conta/verificar', params: { email: email.trim() } });
    } finally { setCarregando(false); }
  }

  return (
    <Screen>
      <Titulo>Entrar</Titulo>
      <Subtitulo>Acesse com seu e-mail e senha, ou pelo gov.br.</Subtitulo>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Campo label="E-mail" valor={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="voce@email.com" />
      <Campo label="Senha" valor={senha} onChange={setSenha} secure placeholder="••••••••" />

      <Btn titulo="Entrar" carregando={carregando} onPress={entrar} />
      <Pressable onPress={() => router.push('/conta/recuperar')}>
        <Text style={{ color: c.primary, textAlign: 'center' }}>Esqueci minha senha</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        <Text style={{ color: c.muted }}>ou</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>

      <Btn titulo="Entrar com gov.br" variante="contorno" onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/api/auth/govbr/login?redirect=/painel`)} />
      <Btn titulo="Criar conta" variante="sutil" onPress={() => router.push('/conta/cadastro')} />
    </Screen>
  );
}
