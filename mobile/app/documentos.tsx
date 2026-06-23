import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useTheme } from '../lib/theme';
import { Icone } from '../components/icone';
import { Card, Pill, Screen, SecaoTitulo, Subtitulo, Titulo, Vazio } from '../components/ui';
import {
  CadastroDocumento,
  DocumentoItem,
  getCadastrosDocumentos,
  getDocumentos,
} from '../lib/api';
import { API_URL } from '../lib/config';

// ─── Tela: lista de cadastros (Leis, Decretos…) ──────────────────────────────

function formatarData(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return null;
  }
}

// ─── Sub-tela: lista de documentos de um cadastro ────────────────────────────

interface ListaDocumentosProps {
  cadastro: CadastroDocumento;
  onVoltar: () => void;
}

const PAGE_SIZE = 20;

function ListaDocumentos({ cadastro, onVoltar }: ListaDocumentosProps) {
  const { c } = useTheme();
  const router = useRouter();

  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');
  const [itens, setItens] = useState<DocumentoItem[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscandoRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(
    async (q: string, pag: number, acumular: boolean) => {
      if (buscandoRef.current) return;
      buscandoRef.current = true;
      acumular ? setCarregandoMais(true) : setCarregando(true);
      setErro(null);
      try {
        const resp = await getDocumentos(cadastro.slug, { q: q || undefined, page: pag });
        setItens((prev) => (acumular ? [...prev, ...resp.documentos.items] : resp.documentos.items));
        setTotal(resp.documentos.total);
        setPagina(pag);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar documentos.');
      } finally {
        acumular ? setCarregandoMais(false) : setCarregando(false);
        buscandoRef.current = false;
      }
    },
    [cadastro.slug],
  );

  // Carga inicial
  useEffect(() => {
    buscar('', 1, false);
  }, [buscar]);

  // Debounce de busca
  function onChangeBusca(texto: string) {
    setBusca(texto);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(texto);
      setItens([]);
      setPagina(1);
      buscar(texto, 1, false);
    }, 450);
  }

  function carregarMais() {
    if (carregandoMais || itens.length >= total) return;
    buscar(buscaAtiva, pagina + 1, true);
  }

  function abrirDocumento(doc: DocumentoItem) {
    if (!doc.arquivoUrl) return;
    const url = doc.arquivoUrl.startsWith('http')
      ? doc.arquivoUrl
      : `${API_URL}${doc.arquivoUrl}`;
    router.push({
      pathname: '/navegador',
      params: { url, titulo: doc.titulo || cadastro.nome },
    });
  }

  const temMais = itens.length < total;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Cabeçalho: botão voltar + título */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 6,
          gap: 10,
        }}
      >
        <Pressable
          onPress={onVoltar}
          accessibilityLabel="Voltar à lista de categorias"
          accessibilityRole="button"
          style={{ padding: 6, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={8}
        >
          <Icone nome="arrow-left" tamanho={24} cor={c.primary} />
        </Pressable>
        <Text style={{ color: c.fg, fontSize: 18, fontWeight: '800', flex: 1 }} numberOfLines={1}>
          {cadastro.nome}
        </Text>
      </View>

      {/* Campo de busca */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 10,
            minHeight: 44,
          }}
        >
          <Icone nome="magnify" tamanho={20} cor={c.muted} />
          <TextInput
            value={busca}
            onChangeText={onChangeBusca}
            placeholder="Buscar por título ou ementa…"
            placeholderTextColor={c.muted}
            returnKeyType="search"
            style={{ flex: 1, color: c.fg, fontSize: 14, paddingVertical: 8, paddingHorizontal: 8 }}
            accessibilityLabel="Campo de busca"
          />
          {busca.length > 0 && (
            <Pressable
              onPress={() => onChangeBusca('')}
              accessibilityLabel="Limpar busca"
              accessibilityRole="button"
              hitSlop={8}
            >
              <Icone nome="close-circle" tamanho={18} cor={c.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Lista */}
      {carregando ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={c.primary} accessibilityLabel="Carregando documentos" />
        </View>
      ) : erro ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Icone nome="alert-circle-outline" tamanho={40} cor={c.danger} />
          <Text style={{ color: c.danger, marginTop: 10, textAlign: 'center' }}>{erro}</Text>
          <Pressable
            onPress={() => buscar(buscaAtiva, 1, false)}
            accessibilityLabel="Tentar novamente"
            accessibilityRole="button"
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: c.primary,
              borderRadius: 10,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.primaryFg, fontWeight: '700' }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={
            <RefreshControl
              refreshing={carregando}
              onRefresh={() => { setItens([]); buscar(buscaAtiva, 1, false); }}
              tintColor={c.primary}
              accessibilityLabel="Atualizar lista"
            />
          }
          onEndReached={carregarMais}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <Vazio>
              {buscaAtiva
                ? `Nenhum documento encontrado para "${buscaAtiva}".`
                : 'Nenhum documento publicado.'}
            </Vazio>
          }
          ListFooterComponent={
            carregandoMais ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={c.primary} accessibilityLabel="Carregando mais documentos" />
              </View>
            ) : temMais ? (
              <Pressable
                onPress={carregarMais}
                accessibilityLabel="Carregar mais documentos"
                accessibilityRole="button"
                style={{
                  marginTop: 8,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: 'center',
                  minHeight: 44,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: c.primary, fontWeight: '600' }}>Carregar mais</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item: doc }) => {
            const podeAbrir = Boolean(doc.arquivoUrl);
            const dataFormatada = formatarData(doc.dataDocumento);
            return (
              <Pressable
                onPress={() => abrirDocumento(doc)}
                disabled={!podeAbrir}
                accessibilityLabel={`${doc.titulo}${doc.numero ? `, número ${doc.numero}` : ''}${doc.ano ? `, ano ${doc.ano}` : ''}`}
                accessibilityRole={podeAbrir ? 'button' : 'text'}
                accessibilityHint={podeAbrir ? 'Abre o documento em PDF' : undefined}
                style={({ pressed }) => [
                  {
                    backgroundColor: c.card,
                    borderColor: c.border,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 14,
                    gap: 6,
                  },
                  pressed && podeAbrir && { opacity: 0.85 },
                  !podeAbrir && { opacity: 0.7 },
                ]}
              >
                {/* Tipo + número/ano */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Pill texto={doc.tipo.nome} />
                  {(doc.numero || doc.ano) && (
                    <Text style={{ color: c.muted, fontSize: 12 }}>
                      {[doc.numero && `Nº ${doc.numero}`, doc.ano && String(doc.ano)].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {dataFormatada && (
                    <Text style={{ color: c.muted, fontSize: 12 }}>{dataFormatada}</Text>
                  )}
                </View>

                {/* Título */}
                <Text style={{ color: c.fg, fontWeight: '700', fontSize: 15 }} numberOfLines={2}>
                  {doc.titulo}
                </Text>

                {/* Ementa */}
                {doc.ementa ? (
                  <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
                    {doc.ementa}
                  </Text>
                ) : null}

                {/* Indicador PDF */}
                {podeAbrir && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Icone nome="file-pdf-box" tamanho={16} cor={c.danger} />
                    <Text style={{ color: c.danger, fontSize: 12, fontWeight: '600' }}>Ver PDF</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ─── Tela raiz: lista de cadastros ───────────────────────────────────────────

export default function Documentos() {
  const { c } = useTheme();
  const navigation = useNavigation();

  const [cadastros, setCadastros] = useState<CadastroDocumento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [cadastroSelecionado, setCadastroSelecionado] = useState<CadastroDocumento | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: cadastroSelecionado ? cadastroSelecionado.nome : 'Documentos oficiais' });
  }, [navigation, cadastroSelecionado]);

  const carregarCadastros = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const dados = await getCadastrosDocumentos();
      setCadastros(dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar categorias.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarCadastros();
  }, [carregarCadastros]);

  // Sub-tela de documentos
  if (cadastroSelecionado) {
    return (
      <ListaDocumentos
        cadastro={cadastroSelecionado}
        onVoltar={() => setCadastroSelecionado(null)}
      />
    );
  }

  // Lista de cadastros
  if (carregando) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} accessibilityLabel="Carregando categorias" />
      </View>
    );
  }

  if (erro) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
          <Icone nome="alert-circle-outline" tamanho={48} cor={c.danger} />
          <Titulo>Não foi possível carregar</Titulo>
          <Subtitulo>{erro}</Subtitulo>
          <Pressable
            onPress={carregarCadastros}
            accessibilityLabel="Tentar novamente"
            accessibilityRole="button"
            style={{
              paddingVertical: 13,
              paddingHorizontal: 24,
              backgroundColor: c.primary,
              borderRadius: 12,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.primaryFg, fontWeight: '700', fontSize: 15 }}>Tentar novamente</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Titulo>Documentos oficiais</Titulo>
      <Subtitulo>Consulte leis, decretos e outros atos normativos do município.</Subtitulo>

      {cadastros.length === 0 ? (
        <Vazio>Nenhuma categoria de documento publicada.</Vazio>
      ) : (
        <>
          <SecaoTitulo>Categorias</SecaoTitulo>
          {cadastros.map((cad) => (
            <Card
              key={cad.slug}
              onPress={() => setCadastroSelecionado(cad)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}
            >
              {/* Ícone */}
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: c.primary + '14',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icone
                  nome={(cad.icone as Parameters<typeof Icone>[0]['nome']) || 'file-document-outline'}
                  tamanho={26}
                  cor={c.primary}
                />
              </View>

              {/* Texto */}
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.fg, fontWeight: '700', fontSize: 16 }}>{cad.nome}</Text>
                {cad.descricao ? (
                  <Text style={{ color: c.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                    {cad.descricao}
                  </Text>
                ) : null}
              </View>

              <Icone nome="chevron-right" tamanho={22} cor={c.muted} />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
