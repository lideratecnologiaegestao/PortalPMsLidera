import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Campo, Btn, Aviso } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export default function Recuperar() {
  const router = useRouter();
  const { recuperar, redefinir } = useAuth();
  const [email, setEmail] = useState('');
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function enviar() {
    setErro(''); setCarregando(true);
    try { await recuperar(email.trim()); setEtapa('codigo'); setMsg('Se houver conta, enviamos um código por e-mail.'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha.'); }
    finally { setCarregando(false); }
  }
  async function redefinirSenha() {
    setErro('');
    if (novaSenha.length < 8) { setErro('A nova senha deve ter ao menos 8 caracteres.'); return; }
    setCarregando(true);
    try { await redefinir(email.trim(), codigo.trim(), novaSenha); router.replace('/conta/login'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível redefinir.'); }
    finally { setCarregando(false); }
  }

  return (
    <Screen>
      <Titulo>Recuperar senha</Titulo>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {msg ? <Aviso tipo="ok">{msg}</Aviso> : null}

      <Campo label="E-mail" valor={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="voce@email.com" />
      {etapa === 'email' ? (
        <Btn titulo="Enviar código" carregando={carregando} onPress={enviar} />
      ) : (
        <>
          <Campo label="Código recebido" valor={codigo} onChange={setCodigo} keyboardType="numeric" placeholder="000000" />
          <Campo label="Nova senha" valor={novaSenha} onChange={setNovaSenha} secure placeholder="mínimo 8 caracteres" />
          <Btn titulo="Redefinir senha" carregando={carregando} onPress={redefinirSenha} />
        </>
      )}
    </Screen>
  );
}
