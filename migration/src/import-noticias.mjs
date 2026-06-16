// Importa as Noticias (K2) do Joomla -> modulo Noticias.
// Fase 1 (descoberta): crawl paginado de /imprensa/todas-as-noticias -> lista de
//   URLs de item (dedup por id K2), salva em state/noticias-urls.json.
// Fase 2 (import): para cada item, limpa corpo, re-hospeda imagens + capa(og:image),
//   cria a noticia via API. Idempotente por id K2 (ledger).
// Flags: MIG_DRY=1 (so mostra), MIG_LIMIT=N (processa so N itens novos por execucao).
import * as cheerio from 'cheerio';
import { ORIGEM, getHtml } from './lib/http.mjs';
import { limparItemK2, texto, slugify } from './lib/clean.mjs';
import { login, postJson, rehospedarHtml, uploadMidiaFromUrl, getJson } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';
import { writeFile, readFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY = process.env.MIG_DRY === '1';
const LIMIT = Number(process.env.MIG_LIMIT || 0) || Infinity;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URLS_FILE = join(ROOT, 'state', 'noticias-urls.json');
const LISTAGEM = '/imprensa/todas-as-noticias';
const RE_ITEM = /\/noticias-[^"'/]+\/item\/(\d+)-[^"'#?]+/g;

async function existe(p) { try { await access(p); return true; } catch { return false; } }

async function descobrir() {
  if (await existe(URLS_FILE)) {
    const cache = JSON.parse(await readFile(URLS_FILE, 'utf8'));
    console.log(`URLs ja descobertas: ${cache.length} (apague ${URLS_FILE} para refazer)`);
    return cache;
  }
  const mapa = new Map(); // id -> path
  for (let start = 0, vazias = 0; start <= 700 && vazias < 2; start += 20) {
    const url = `${ORIGEM}${LISTAGEM}${start ? `?start=${start}` : ''}`;
    let html;
    try { ({ html } = await getHtml(url)); } catch (e) { console.log(`listagem start=${start} erro: ${e.message}`); break; }
    let novas = 0;
    for (const m of html.matchAll(RE_ITEM)) {
      const id = m[1]; const path = m[0];
      if (!mapa.has(id)) { mapa.set(id, path); novas++; }
    }
    console.log(`listagem start=${start}: +${novas} (total ${mapa.size})`);
    vazias = novas === 0 ? vazias + 1 : 0;
  }
  const lista = [...mapa.entries()].map(([id, path]) => ({ id, path }));
  await mkdir(dirname(URLS_FILE), { recursive: true });
  await writeFile(URLS_FILE, JSON.stringify(lista, null, 2), 'utf8');
  return lista;
}

function categoriaDoPath(path) {
  const m = path.match(/\/noticias-([^/]+)\/item\//);
  if (!m) return 'Notícias';
  let c = m[1].replace(/^em-/, '').replace(/^geral-?/, '').replace(/secretaria-de-/, '').replace(/-/g, ' ').trim();
  if (!c || c === 'geral') return 'Geral';
  return c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function ogImage(html) {
  const $ = cheerio.load(html);
  const u = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content');
  return u ? new URL(u, ORIGEM).href : null;
}

async function run() {
  const itens = await descobrir();
  console.log(`== Noticias: ${itens.length} itens descobertos ${DRY ? '[DRY]' : ''} (LIMIT=${LIMIT}) ==`);
  const ledger = await new Ledger('noticias').load();
  const redirects = await new Ledger('redirects').load();
  if (!DRY) await login();

  let novos = 0, pulados = 0, erros = 0;
  for (const it of itens) {
    if (novos >= LIMIT) { console.log(`(limite ${LIMIT} atingido)`); break; }
    if (ledger.has(it.id)) { pulados++; continue; }
    try {
      const { html: cru } = await getHtml(ORIGEM + it.path);
      const { titulo, dataIso, html, imagens } = limparItemK2(cru, { origem: ORIGEM });
      if (!titulo) { console.log(`SEM titulo: ${it.path}`); }
      const tit = titulo || `Notícia ${it.id}`;
      const categoria = categoriaDoPath(it.path);
      const slug = `${it.id}-${slugify(tit).slice(0, 60)}`;
      const capaOrig = ogImage(cru) || imagens[0]?.src || null;

      if (DRY) {
        console.log(`#${it.id} [${categoria}] ${tit.slice(0, 70)} | ${dataIso || '?'} | imgs=${imagens.length} | capa=${capaOrig ? 'sim' : 'nao'}`);
        novos++; continue;
      }

      const conteudo = await rehospedarHtml(html, { categoriaSlug: 'noticias' });
      let imagemUrl = null;
      if (capaOrig) { try { imagemUrl = await uploadMidiaFromUrl(capaOrig, { alt: tit, categoriaSlug: 'noticias' }); } catch {} }
      const resumo = texto(html).slice(0, 240) || null;

      await postJson('/api/admin/noticias', {
        slug, titulo: tit, resumo, conteudo, categoria,
        autor: 'Prefeitura de Barão de Melgaço',
        ...(imagemUrl ? { imagemUrl } : {}),
        ...(dataIso ? { publicadoEm: `${dataIso}T12:00:00.000Z` } : {}),
        publicado: true,
      });
      await ledger.set(it.id, { slug, titulo: tit, categoria, data: dataIso });
      await redirects.set(it.path, { paraSlug: `noticias/${slug}`, tipo: 'noticia' });
      novos++;
      if (novos % 20 === 0) console.log(`... ${novos} importadas`);
    } catch (e) {
      erros++;
      if (String(e.message).match(/400.*slug|j[aá] (existe|cadastrad)/i)) {
        await ledger.set(it.id, { slug: null, nota: 'slug duplicado/ja existe' });
      } else {
        console.error(`ERRO #${it.id}: ${String(e.message).slice(0, 160)}`);
      }
    }
  }
  console.log(`== fim noticias: novos=${novos} pulados=${pulados} erros=${erros} ==`);
}

run().catch((e) => { console.error(e); process.exit(1); });
