import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Screen, Titulo, Subtitulo, Campo, Btn, Aviso } from '../../components/ui';
import { useAuth } from '../../lib/auth';

export default function Cadastro() {
  const router = useRouter();
  const { cadastrar } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function criar() {
    setErro('');
    if (!nome.trim() || !email.trim() || senha.length < 8) {
      setErro('Preencha nome, e-mail e uma senha de ao menos 8 caracteres.'); return;
    }
    setCarregando(true);
    try {
      await cadastrar({ nome: nome.trim(), email: email.trim(), telefone: telefone.trim() || undefined, senha });
      router.replace({ pathname: '/conta/verificar', params: { email: email.trim() } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha no cadastro.');
    } finally { setCarregando(false); }
  }

  return (
    <Screen>
      <Titulo>Criar conta</Titulo>
      <Subtitulo>Você receberá um código por e-mail e outro por WhatsApp para confirmar.</Subtitulo>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Campo label="Nome completo" valor={nome} onChange={setNome} placeholder="Seu nome" />
      <Campo label="E-mail" valor={email} onChange={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="voce@email.com" />
      <Campo label="Celular (WhatsApp)" valor={telefone} onChange={setTelefone} keyboardType="phone-pad" placeholder="(DDD) 9xxxx-xxxx" />
      <Campo label="Senha" valor={senha} onChange={setSenha} secure placeholder="mínimo 8 caracteres" />

      <Btn titulo="Criar conta" carregando={carregando} onPress={criar} />
      <Subtitulo>
        Seus dados são tratados conforme a LGPD. O número é usado para confirmar
        sua identidade e notificá-lo sobre suas manifestações.
      </Subtitulo>
    </Screen>
  );
}
