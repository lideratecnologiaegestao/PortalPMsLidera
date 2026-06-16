import { API_URL } from './config';

// ─── Chamados urbanos georreferenciados (PostGIS) ────────────────────────────
export interface ProximoChamado {
  protocolo: string;
  categoria: string;
  status: string;
  bairro?: string;
}

export interface NovoChamadoInput {
  categoria: string;
  descricao: string;
  lat: number;
  lng: number;
  anonimo: boolean;
  fotoUri?: string;
}

export async function proximos(lat: number, lng: number, raio = 1000): Promise<ProximoChamado[]> {
  const res = await fetch(`${API_URL}/api/chamados/proximos?lat=${lat}&lng=${lng}&raio=${raio}`);
  if (!res.ok) throw new Error('Falha ao buscar chamados próximos.');
  return res.json();
}

/** Erro de rede (sem conexão) — o `fetch` rejeita antes de ter resposta HTTP. */
export class SemRedeError extends Error {}

/** Abre um chamado (multipart). A foto sobe para a API, que grava no storage. */
export async function criarChamado(input: NovoChamadoInput) {
  const form = new FormData();
  form.append('categoria', input.categoria);
  form.append('descricao', input.descricao);
  form.append('lat', String(input.lat));
  form.append('lng', String(input.lng));
  form.append('anonimo', input.anonimo ? 'true' : 'false');
  if (input.fotoUri) {
    form.append('fotos', { uri: input.fotoUri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chamados`, { method: 'POST', body: form });
  } catch (e) {
    // fetch só rejeita por falha de REDE (sem internet, DNS, TLS) — não por HTTP 4xx/5xx.
    throw new SemRedeError(e instanceof Error ? e.message : 'Network request failed');
  }
  if (!res.ok) {
    let detalhe = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) detalhe = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch { /* corpo não-JSON */ }
    throw new Error(`Não foi possível registrar (${detalhe}).`);
  }
  return res.json() as Promise<{ protocolo: string; status: string; possiveisDuplicados: unknown[] }>;
}

export async function acompanharChamado(protocolo: string) {
  const res = await fetch(`${API_URL}/api/chamados/${encodeURIComponent(protocolo)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao consultar o protocolo.');
  return res.json();
}

// ─── Notícias ────────────────────────────────────────────────────────────────
export interface NoticiaItem {
  id: string;
  slug: string;
  titulo: string;
  resumo?: string;
  imagemUrl?: string;
  categoria?: string;
  publicadoEm?: string;
}
export interface NoticiaDetalhe extends NoticiaItem {
  conteudo?: string;
  corpo?: string;
}

export async function getNoticias(pageSize = 12): Promise<NoticiaItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/noticias?pageSize=${pageSize}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? data ?? [];
  } catch { return []; }
}
export async function getNoticia(slug: string): Promise<NoticiaDetalhe | null> {
  try {
    const res = await fetch(`${API_URL}/api/noticias/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ─── Ouvidoria / e-SIC (manifestações) ──────────────────────────────────────
export interface RegistrarManifestacao {
  canal: 'ouvidoria' | 'esic';
  tipo: string;
  assunto: string;
  descricao: string;
  anonima?: boolean;
  solicitanteNome?: string;
  solicitanteEmail?: string;
}
export interface RegistroResposta {
  id: string;
  protocolo: string;
  canal: string;
  chave: string;
}
export interface ManifestacaoDetalhe {
  protocolo: string;
  canal: string;
  tipo: string;
  status: string;
  assunto: string;
  descricao: string;
  prazoEm: string;
  prorrogado: boolean;
  resposta: string | null;
  criadoEm: string;
  eventos: { id: string; evento: string; paraStatus: string; observacao: string | null; criadoEm: string }[];
  mensagens: { id: string; autorTipo: string; autorNome: string; conteudo: string; criadoEm: string }[];
  anexos: { id: string; nomeArquivo: string; mime: string; origem: string; criadoEm: string }[];
}

export async function registrarManifestacao(input: RegistrarManifestacao): Promise<RegistroResposta> {
  const res = await fetch(`${API_URL}/api/manifestacoes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = 'Falha ao registrar.';
    try { const j = await res.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message); } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function acompanharManifestacao(protocolo: string, chave?: string, token?: string | null): Promise<ManifestacaoDetalhe> {
  const url = `${API_URL}/api/manifestacoes/acompanhar?protocolo=${encodeURIComponent(protocolo)}${chave ? `&chave=${encodeURIComponent(chave)}` : ''}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error('Protocolo ou chave inválidos.');
  return res.json();
}

/** Cidadão anexa uma foto à manifestação (multipart). Logado por token OU chave. */
export async function anexarManifestacao(
  protocolo: string,
  fotoUri: string,
  opts: { chave?: string; token?: string | null } = {},
): Promise<ManifestacaoDetalhe> {
  const form = new FormData();
  form.append('file', { uri: fotoUri, name: 'foto.jpg', type: 'image/jpeg' } as unknown as Blob);
  form.append('protocolo', protocolo);
  if (opts.chave) form.append('chave', opts.chave);
  const res = await fetch(`${API_URL}/api/manifestacoes/acompanhar/anexo`, {
    method: 'POST',
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
    body: form,
  });
  if (!res.ok) throw new Error('Falha ao anexar a foto.');
  return res.json();
}

/** URL de download/visualização de um anexo (autorizada por chave; logado usa headers). */
export const urlAnexoManifestacao = (id: string, protocolo: string, chave?: string) =>
  `${API_URL}/api/manifestacoes/acompanhar/anexo/${id}?protocolo=${encodeURIComponent(protocolo)}${chave ? `&chave=${encodeURIComponent(chave)}` : ''}`;

/** Cidadão responde à ouvidoria na tramitação (logado por token OU por chave). */
export async function responderOuvidoria(
  protocolo: string,
  conteudo: string,
  opts: { chave?: string; token?: string | null } = {},
): Promise<ManifestacaoDetalhe> {
  const res = await fetch(`${API_URL}/api/manifestacoes/acompanhar/mensagem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({ protocolo, chave: opts.chave, conteudo }),
  });
  if (!res.ok) {
    let msg = 'Falha ao enviar mensagem.';
    try { const j = await res.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message); } catch { /* */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function estatisticasOuvidoria(): Promise<{ total: number; taxaNoPrazo: number | null; tempoMedioDias: number | null; abertos: number } | null> {
  try {
    const res = await fetch(`${API_URL}/api/manifestacoes/estatisticas`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ─── Central de notificações (in-app) ───────────────────────────────────────
export interface Aviso {
  id: string;
  titulo: string;
  corpo: string | null;
  protocolo: string | null;
  evento: string;
  lida: boolean;
  criadoEm: string;
}

export async function getNotificacoes(token: string): Promise<{ items: Aviso[]; naoLidas: number }> {
  const res = await fetch(`${API_URL}/api/me/notificacoes`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { items: [], naoLidas: 0 };
  return res.json();
}
export async function naoLidasNotif(token: string): Promise<number> {
  try {
    const res = await fetch(`${API_URL}/api/me/notificacoes/nao-lidas`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return 0;
    return (await res.json()).total ?? 0;
  } catch { return 0; }
}
export async function marcarLidasNotif(token: string): Promise<void> {
  await fetch(`${API_URL}/api/me/notificacoes/ler`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}',
  }).catch(() => undefined);
}
