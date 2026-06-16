import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Campo, Btn, Aviso, Card, Pill } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';

export default function Verificar() {
  const { c } = useTheme();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verificar, reenviar } = useAuth();

  const [codEmail, setCodEmail] = useState('');
  const [codTel, setCodTel] = useState('');
  const [emailOk, setEmailOk] = useState(false);
  const [telOk, setTelOk] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  async function confirmar(finalidade: 'email' | 'telefone', codigo: string) {
    setErro(''); setMsg('');
    try {
      await verificar(email!, finalidade, codigo.trim());
      if (finalidade === 'email') setEmailOk(true); else setTelOk(true);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Código inválido.'); }
  }
  async function reenviarCod(finalidade: 'email' | 'telefone') {
    setErro(''); setMsg('');
    try { await reenviar(email!, finalidade); setMsg('Novo código enviado.'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha.'); }
  }

  return (
    <Screen>
      <Titulo>Confirmar conta</Titulo>
      <Subtitulo>Enviamos um código para {email}. Confirme abaixo.</Subtitulo>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {msg ? <Aviso tipo="ok">{msg}</Aviso> : null}

      {/* E-mail */}
      <Card>
        <Pill texto={emailOk ? 'E-mail confirmado ✓' : 'E-mail'} cor={emailOk ? c.success : c.primary} />
        {!emailOk && (
          <>
            <Campo label="Código do e-mail" valor={codEmail} onChange={setCodEmail} keyboardType="numeric" placeholder="000000" />
            <Btn titulo="Confirmar e-mail" onPress={() => confirmar('email', codEmail)} style={{ marginTop: 8 }} />
            <Pressable onPress={() => reenviarCod('email')}><Text style={{ color: c.primary, marginTop: 8 }}>Reenviar código do e-mail</Text></Pressable>
          </>
        )}
      </Card>

      {/* WhatsApp */}
      <Card>
        <Pill texto={telOk ? 'WhatsApp confirmado ✓' : 'WhatsApp'} cor={telOk ? c.success : c.primary} />
        {!telOk && (
          <>
            <Campo label="Código do WhatsApp" valor={codTel} onChange={setCodTel} keyboardType="numeric" placeholder="000000" />
            <Btn titulo="Confirmar WhatsApp" variante="contorno" onPress={() => confirmar('telefone', codTel)} style={{ marginTop: 8 }} />
            <Pressable onPress={() => reenviarCod('telefone')}><Text style={{ color: c.primary, marginTop: 8 }}>Reenviar código do WhatsApp</Text></Pressable>
          </>
        )}
      </Card>

      <Subtitulo>O e-mail é obrigatório para entrar. O WhatsApp confirma seu número para avisos.</Subtitulo>
      {emailOk && <Btn titulo="Ir para o login" onPress={() => router.replace('/conta/login')} />}
    </Screen>
  );
}
