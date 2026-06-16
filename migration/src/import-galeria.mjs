// Importa Galeria (K2) -> modulo Galeria. MIG_GAL=videos|fotos|all (default all).
// Videos: extrai embed YouTube do item -> galeria(video/youtube). Fotos: coleta
// imagens /media/k2/ do item -> re-hospeda (cap por album) -> galeria(foto).
// Idempotente (ledger por id de item). Flags: MIG_DRY, MIG_LIMIT, MIG_FOTOS_CAP.
import * as cheerio from 'cheerio';
import { ORIGEM, getHtml } from './lib/http.mjs';
import { slugify } from './lib/clean.mjs';
import { login, postJson, uploadMidiaFromUrl } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const DRY = process.env.MIG_DRY === '1';
const LIMIT = Number(process.env.MIG_LIMIT || 0) || Infinity;
const GAL = process.env.MIG_GAL || 'all';
const FOTOS_CAP = Number(process.env.MIG_FOTOS_CAP || 12);
const RE_ITEM = /\/(?:imprensa\/(?:videos|banco-de-imagens)|fotos-[^"'/]+)\/item\/(\d+)-[^"'#?]+/g;

async function listar(base) {
  const ids = new Map();
  for (let start = 0, vazias = 0; start <= 400 && vazias < 2; start += 20) {
    let html;
    try { ({ html } = await getHtml(`${ORIGEM}${base}${start ? `?start=${start}` : ''}`)); } catch { break; }
    let novas = 0;
    for (const m of html.matchAll(RE_ITEM)) { if (!ids.has(m[1])) { ids.set(m[1], m[0]); novas++; } }
    vazias = novas === 0 ? vazias + 1 : 0;
  }
  return [...ids.entries()].map(([id, path]) => ({ id, path }));
}

function youtubeId(html) {
  const m = html.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function tituloItem(html) {
  const $ = cheerio.load(html);
  return ($('.itemTitle, h1, h2.item-title').first().text() || '').trim().slice(0, 200);
}
function imagensK2(html) {
  const $ = cheerio.load(html);
  const urls = new Set();
  $('a[href*="/media/k2/"], img[src*="/media/k2/"]').each((_, el) => {
    let u = $(el).attr('href') || $(el).attr('src'); if (!u) return;
    u = new URL(u, ORIGEM).href.replace(/_[SMLX]+\.(jpg|jpeg|png)/i, '.$1'); // pega original, nao thumb
    if (/\.(jpg|jpeg|png)$/i.test(u)) urls.add(u);
  });
  return [...urls];
}

async function run() {
  const ledger = await new Ledger('galeria').load();
  if (!DRY) await login();
  let novos = 0;

  if (GAL === 'videos' || GAL === 'all') {
    const vids = await listar('/imprensa/videos');
    console.log(`== Videos: ${vids.length} itens ${DRY ? '[DRY]' : ''} ==`);
    for (const v of vids) {
      if (novos >= LIMIT) break;
      if (ledger.has('v' + v.id)) continue;
      try {
        const { html } = await getHtml(ORIGEM + v.path);
        const yt = youtubeId(html); const titulo = tituloItem(html) || `Vídeo ${v.id}`;
        if (!yt) { console.log(`  (sem youtube): ${v.path}`); await ledger.set('v' + v.id, { nota: 'sem youtube' }); continue; }
        if (DRY) { console.log(`  #${v.id} ${titulo.slice(0, 60)} -> yt:${yt}`); novos++; continue; }
        await postJson('/api/admin/galeria', { tipo: 'video', titulo, youtube: `https://www.youtube.com/watch?v=${yt}`, ordem: 0 });
        await ledger.set('v' + v.id, { titulo, youtube: yt }); novos++;
      } catch (e) { console.error(`  ERRO video #${v.id}: ${String(e.message).slice(0, 120)}`); }
    }
  }

  if (GAL === 'fotos' || GAL === 'all') {
    const albums = await listar('/imprensa/banco-de-imagens');
    console.log(`== Fotos: ${albums.length} albuns (cap ${FOTOS_CAP}/album) ${DRY ? '[DRY]' : ''} ==`);
    for (const a of albums) {
      if (novos >= LIMIT) break;
      if (ledger.has('f' + a.id)) continue;
      try {
        const { html } = await getHtml(ORIGEM + a.path);
        const titulo = tituloItem(html) || `Álbum ${a.id}`;
        const imgs = imagensK2(html).slice(0, FOTOS_CAP);
        if (DRY) { console.log(`  #${a.id} ${titulo.slice(0, 50)} -> ${imgs.length} fotos`); novos++; continue; }
        let ok = 0;
        for (const img of imgs) {
          try { const url = await uploadMidiaFromUrl(img, { alt: titulo, categoriaSlug: 'galeria' }); await postJson('/api/admin/galeria', { tipo: 'foto', titulo, url, ordem: ok }); ok++; }
          catch {}
        }
        await ledger.set('f' + a.id, { titulo, fotos: ok }); novos++;
        if (novos % 20 === 0) console.log(`  ... ${novos} albuns`);
      } catch (e) { console.error(`  ERRO album #${a.id}: ${String(e.message).slice(0, 120)}`); }
    }
  }
  console.log(`== fim galeria: processados=${novos} ==`);
}
run().catch((e) => { console.error(e); process.exit(1); });
