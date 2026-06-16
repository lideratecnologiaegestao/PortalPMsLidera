// Cliente da API da plataforma (fala SOMENTE com a API; nunca com banco/storage).
// Mantem cookie de sessao manualmente (portal_session HttpOnly+Secure).
import * as cheerio from 'cheerio';
import { API_BASE, TENANT_HOST, ADMIN_EMAIL, ADMIN_SENHA } from '../config.mjs';
import { getBinary, sha256 } from './http.mjs';
import { Ledger } from './state.mjs';

let cookie = '';
const baseHeaders = () => ({ Host: TENANT_HOST, ...(cookie ? { Cookie: cookie } : {}) });

export async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Host: TENANT_HOST },
    body: JSON.stringify({ email: ADMIN_EMAIL, senha: ADMIN_SENHA }),
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const sess = setCookies.find((c) => c.startsWith('portal_session='));
  if (!res.ok || !sess) {
    throw new Error(`Login falhou: HTTP ${res.status} ${await res.text()}`);
  }
  cookie = sess.split(';')[0];
  const body = await res.json().catch(() => ({}));
  if (body.mfaRequired) throw new Error('Admin exige MFA — desabilite MFA p/ a conta de importacao ou trate o TOTP.');
  return body;
}

export async function postMultipart(path, fd) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: baseHeaders(), body: fd });
  const txt = await res.text();
  if (!res.ok) throw new Error(`POST(mp) ${path} -> HTTP ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

export async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: baseHeaders() });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

export async function postJson(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> HTTP ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

export async function delJson(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: baseHeaders() });
  const txt = await res.text();
  if (!res.ok) throw new Error(`DELETE ${path} -> HTTP ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

export async function putJson(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { ...baseHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} -> HTTP ${res.status} ${txt}`);
  return txt ? JSON.parse(txt) : {};
}

/**
 * Upsert idempotente de pagina CMS: acha por slug (ou cria), garante 1 bloco
 * 'texto' (cria ou atualiza, sem duplicar) e publica. Reusavel p/ institucional,
 * ouvidoria, LGPD, etc.
 */
export async function upsertPaginaCms({ slug, titulo, corpoHtml }) {
  const lista = await getJson(`/api/admin/pages?q=${encodeURIComponent(slug)}&pageSize=100`);
  const items = Array.isArray(lista) ? lista : (lista.items || []);
  let page = items.find((p) => p.slug === slug);
  let criado = false;
  if (!page) { page = await postJson('/api/pages', { slug, titulo }); criado = true; }

  const det = await getJson(`/api/admin/pages/${page.id}`).catch(() => null);
  const blocks = det?.blocks || [];
  // Bloco 'html' renderiza o HTML sanitizado (dangerouslySetInnerHTML); 'texto'
  // escaparia as tags. Conteudo institucional ja vem sanitizado do clean.mjs.
  if (blocks.length === 0) {
    await postJson(`/api/pages/${page.id}/blocks`, { tipo: 'html', ordem: 0, conteudo: { html: corpoHtml } });
  } else {
    const b = blocks.find((x) => x.tipo === 'html') || blocks.find((x) => x.tipo === 'texto') || blocks[0];
    await putJson(`/api/blocks/${b.id}`, { tipo: 'html', conteudo: { html: corpoHtml } });
  }
  await putJson(`/api/pages/${page.id}`, { publicado: true });
  return { id: page.id, criado };
}

// ---- Cadastro de Documentos: garante cadastro/tipo (idempotente) ----
let _cadastros = null;
export async function ensureCadastro(nome, { descricao } = {}) {
  if (!_cadastros) _cadastros = await getJson('/api/admin/documentos/cadastros');
  const lista = Array.isArray(_cadastros) ? _cadastros : (_cadastros.items || []);
  const achou = lista.find((x) => (x.nome || '').toLowerCase() === nome.toLowerCase());
  if (achou) return achou.id;
  const novo = await postJson('/api/admin/documentos/cadastros', { nome, ...(descricao ? { descricao } : {}), visibilidade: 'publico' });
  _cadastros = null;
  return novo.id;
}
const _tipos = {};
export async function ensureTipo(cadastroId, nome) {
  if (!nome) return null;
  if (!_tipos[cadastroId]) _tipos[cadastroId] = await getJson(`/api/admin/documentos/cadastros/${cadastroId}/tipos`);
  const lista = Array.isArray(_tipos[cadastroId]) ? _tipos[cadastroId] : (_tipos[cadastroId].items || []);
  const achou = lista.find((x) => (x.nome || '').toLowerCase() === nome.toLowerCase());
  if (achou) return achou.id;
  const novo = await postJson(`/api/admin/documentos/cadastros/${cadastroId}/tipos`, { nome });
  _tipos[cadastroId] = null;
  return novo.id;
}
export async function createDocumento(dados) { return postJson('/api/admin/documentos', dados); }

/** Upsert idempotente de Secretaria por slug. */
export async function upsertSecretaria(dados) {
  const lista = await getJson('/api/admin/secretarias');
  const items = Array.isArray(lista) ? lista : (lista.items || []);
  const existente = items.find((s) => s.slug === dados.slug);
  if (existente) {
    await putJson(`/api/admin/secretarias/${existente.id}`, dados);
    return { id: existente.id, criado: false };
  }
  const nova = await postJson('/api/admin/secretarias', dados);
  return { id: nova.id, criado: true };
}

// ---- categorias de midia (cacheado) ----
let _categorias = null;
async function categoriaId(slug) {
  if (!_categorias) _categorias = await getJson('/api/midia/categorias');
  const lista = Array.isArray(_categorias) ? _categorias : (_categorias.items || []);
  const cat = lista.find((c) => c.slug === slug);
  if (!cat) throw new Error(`Categoria de midia '${slug}' nao encontrada no tenant.`);
  return cat.id;
}

// ---- upload de midia a partir de uma URL do site antigo, com dedup por checksum ----
const _midiaLedger = new Ledger('midia');
let _midiaLoaded = false;

export async function uploadMidiaFromUrl(url, { alt, categoriaSlug, visibilidade = 'publico', nome: nomeOverride }) {
  if (!_midiaLoaded) { await _midiaLedger.load(); _midiaLoaded = true; }
  const { buffer, contentType, nome: nomeAuto } = await getBinary(url);
  const nome = nomeOverride || nomeAuto;
  const checksum = sha256(buffer);
  const existente = _midiaLedger.get(checksum);
  if (existente) return existente.urlPublica; // dedup global por conteudo

  const catId = await categoriaId(categoriaSlug);
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: contentType }), nome);
  fd.append('categoriaId', catId);
  fd.append('visibilidade', visibilidade);
  if (visibilidade === 'publico' && contentType.startsWith('image/')) {
    fd.append('altText', (alt || nome).slice(0, 300));
  }
  const res = await fetch(`${API_BASE}/api/midia`, { method: 'POST', headers: baseHeaders(), body: fd });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Upload midia (${url}) -> HTTP ${res.status} ${txt}`);
  const out = JSON.parse(txt);
  await _midiaLedger.set(checksum, { urlPublica: out.urlPublica, id: out.id, origem: url });
  return out.urlPublica;
}

// Reescreve <img src> de um fragmento HTML: baixa do site antigo, re-hospeda via
// API e troca o src pela URL mascarada. Imagem quebrada e removida (sem link morto).
export async function rehospedarHtml(html, { categoriaSlug = 'noticias' } = {}) {
  const $ = cheerio.load(html || '', null, false);
  for (const el of $('img').toArray()) {
    const src = $(el).attr('src');
    if (!src || !/^https?:/i.test(src)) { $(el).remove(); continue; }
    try {
      const nova = await uploadMidiaFromUrl(src, { alt: $(el).attr('alt') || '', categoriaSlug });
      $(el).attr('src', nova);
    } catch {
      $(el).remove();
    }
  }
  return $.html();
}
