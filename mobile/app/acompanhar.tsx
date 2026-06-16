import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Screen, Titulo, Subtitulo, Card, Btn, Campo, Aviso, SecaoTitulo, Pill } from '../components/ui';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { rotuloCategoria, STATUS_LABEL } from '../lib/config';
import {
  acompanharChamado, acompanharManifestacao, anexarManifestacao, responderOuvidoria,
  urlAnexoManifestacao, ManifestacaoDetalhe,
} from '../lib/api';

const ENCERRADOS = ['concluida', 'arquivada'];

export default function Acompanhar() {
  const { c } = useTheme();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ protocolo?: string }>();
  const [protocolo, setProtocolo] = useState(params.protocolo ?? '');
  const [chave, setChave] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [chamado, setChamado] = useState<any | null>(null);
  const [manif, setManif] = useState<ManifestacaoDetalhe | null>(null);

  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [anexando, setAnexando] = useState(false);

  async function buscar() {
    const p = protocolo.trim();
    if (!p) { setErro('Informe o protocolo.'); return; }
    setCarregando(true); setErro(''); setChamado(null); setManif(null);
    try {
      if (chave.trim()) {
        setManif(await acompanharManifestacao(p, chave.trim(), token));
      } else {
        const ch = await acompanharChamado(p);
        if (ch) setChamado(ch);
        else setManif(await acompanharManifestacao(p, undefined, token));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível consultar.');
    } finally {
      setCarregando(false);
    }
  }

  async function responder() {
    if (!manif || !msg.trim()) return;
    setEnviando(true); setErro('');
    try {
      const atual = await responderOuvidoria(manif.protocolo, msg.trim(), { chave: chave.trim() || undefined, token });
      setManif(atual);
      setMsg('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar.');
    } finally {
      setEnviando(false);
    }
  }

  async function anexarFoto(camera: boolean) {
    if (!manif) return;
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErro('Permissão de câmera/galeria negada.'); return; }
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (r.canceled || !r.assets?.[0]) return;
    setAnexando(true); setErro('');
    try {
      const atual = await anexarManifestacao(manif.protocolo, r.assets[0].uri, { chave: chave.trim() || undefined, token });
      setManif(atual);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao anexar.');
    } finally {
      setAnexando(false);
    }
  }

  // fonte da imagem do anexo (logado usa header Bearer; anônimo usa a chave na URL)
  function anexoSource(id: string) {
    const uri = urlAnexoManifestacao(id, manif!.protocolo, chave.trim() || undefined);
    return token ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri };
  }

  const encerrada = manif ? ENCERRADOS.includes(manif.status) : false;

  return (
    <Screen>
      <Titulo>Acompanhar</Titulo>
      <Subtitulo>Informe o protocolo. Para manifestações de Ouvidoria, informe também a chave.</Subtitulo>

      <Campo label="Protocolo" valor={protocolo} onChange={setProtocolo} autoCapitalize="none" placeholder="2026000123" />
      <Campo label="Chave (opcional)" valor={chave} onChange={setChave} autoCapitalize="none" placeholder="ABCDE-FGHJK" />
      <Btn titulo="Consultar" carregando={carregando} onPress={buscar} />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {carregando ? <ActivityIndicator color={c.primary} /> : null}

      {/* Chamado urbano */}
      {chamado && (
        <Card>
          <Pill texto={STATUS_LABEL[chamado.status] ?? chamado.status} />
          <Text style={{ color: c.fg, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{rotuloCategoria(chamado.categoria)}</Text>
          {chamado.bairro ? <Subtitulo>{chamado.bairro}</Subtitulo> : null}
          {chamado.descricao ? <Text style={{ color: c.fg, marginTop: 8 }}>{chamado.descricao}</Text> : null}
          <SecaoTitulo>Histórico</SecaoTitulo>
          {(chamado.atualizacoes ?? []).length === 0 && <Subtitulo>Sem atualizações ainda.</Subtitulo>}
          {(chamado.atualizacoes ?? []).map((a: any, i: number) => (
            <View key={i} style={{ borderLeftWidth: 3, borderLeftColor: c.primary, paddingLeft: 10, marginTop: 8 }}>
              <Text style={{ color: c.fg, fontWeight: '600' }}>{STATUS_LABEL[a.status] ?? a.status}</Text>
              {a.comentario ? <Subtitulo>{a.comentario}</Subtitulo> : null}
            </View>
          ))}
        </Card>
      )}

      {/* Manifestação (Ouvidoria / e-SIC) — chat com a ouvidoria */}
      {manif && (
        <Card>
          <Pill texto={STATUS_LABEL[manif.status] ?? manif.status} />
          <Text style={{ color: c.fg, fontSize: 18, fontWeight: '800', marginTop: 6 }}>{manif.assunto}</Text>
          <Subtitulo>{manif.canal === 'esic' ? 'e-SIC' : 'Ouvidoria'} · prazo {new Date(manif.prazoEm).toLocaleDateString('pt-BR')}{manif.prorrogado ? ' (prorrogado)' : ''}</Subtitulo>

          <SecaoTitulo>Conversa</SecaoTitulo>

          {/* abertura: a descrição enviada */}
          <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: c.primary + '18', borderRadius: 12, borderBottomRightRadius: 2, padding: 10, marginTop: 6 }}>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12 }}>Você · {new Date(manif.criadoEm).toLocaleDateString('pt-BR')}</Text>
            <Text style={{ color: c.fg, marginTop: 2 }}>{manif.descricao}</Text>
          </View>

          {manif.mensagens.map((m) => {
            const meu = m.autorTipo === 'cidadao';
            return (
              <View key={m.id} style={{
                alignSelf: meu ? 'flex-end' : 'flex-start', maxWidth: '85%', marginTop: 8, padding: 10, borderRadius: 12,
                borderBottomRightRadius: meu ? 2 : 12, borderBottomLeftRadius: meu ? 12 : 2,
                backgroundColor: meu ? c.primary + '18' : c.card, borderWidth: meu ? 0 : 1, borderColor: c.border,
              }}>
                <Text style={{ color: meu ? c.primary : c.muted, fontWeight: '700', fontSize: 12 }}>
                  {meu ? 'Você' : m.autorNome} · {new Date(m.criadoEm).toLocaleString('pt-BR')}
                </Text>
                <Text style={{ color: c.fg, marginTop: 2 }}>{m.conteudo}</Text>
              </View>
            );
          })}

          {/* Anexos */}
          {manif.anexos.length > 0 && (
            <>
              <SecaoTitulo>Anexos</SecaoTitulo>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {manif.anexos.map((a) =>
                  a.mime?.startsWith('image/') ? (
                    <Image key={a.id} source={anexoSource(a.id)} style={{ width: 90, height: 90, borderRadius: 8, backgroundColor: c.muted + '22' }} />
                  ) : (
                    <View key={a.id} style={{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
                      <Text style={{ color: c.fg, fontSize: 12 }}>📎 {a.nomeArquivo}</Text>
                    </View>
                  ),
                )}
              </View>
            </>
          )}

          {/* caixa de resposta */}
          {encerrada ? (
            <Subtitulo>Esta manifestação foi encerrada.</Subtitulo>
          ) : (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Campo label="Responder à ouvidoria" valor={msg} onChange={setMsg} multiline placeholder="Escreva sua mensagem ou complemento…" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn titulo="Enviar" icone="send" carregando={enviando} disabled={!msg.trim()} onPress={responder} style={{ flex: 1 }} />
                <Btn titulo="Câmera" icone="camera-outline" carregando={anexando} variante="contorno" onPress={() => anexarFoto(true)} style={{ flex: 1 }} />
                <Btn titulo="" icone="image-multiple-outline" variante="contorno" onPress={() => anexarFoto(false)} />
              </View>
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}
