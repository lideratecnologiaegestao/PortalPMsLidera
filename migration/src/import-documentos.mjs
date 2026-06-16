// Importa Documentos (Joomla jDownloads: categoria -> ano -> doc com /download)
// -> Cadastro de Documentos da plataforma. Baixa o PDF -> Biblioteca de Midia ->
// vincula ao documento. Cria cadastro/tipo se faltar (fecha P0 #5). Idempotente
// por id de origem. Flags: MIG_DRY=1, MIG_LIMIT=N (por execucao).
import * as cheerio from 'cheerio';
import { ORIGEM, getHtml } from './lib/http.mjs';
import { slugify } from './lib/clean.mjs';
import { login, ensureCadastro, ensureTipo, createDocumento, uploadMidiaFromUrl } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const DRY = process.env.MIG_DRY === '1';
const LIMIT = Number(process.env.MIG_LIMIT || 0) || Infinity;

// de-para: caminho-base da categoria no Joomla -> { cadastro, tipo, midiaCat }
const CATEGORIAS = [
  { path: '/sic-atos-normativos/sic-decretos', cadastro: 'Decretos', tipo: null, midia: 'leis' },
  { path: '/sic-atos-normativos/sic-portaria', cadastro: 'Portarias', tipo: null, midia: 'leis' },
  { path: '/sic-atos-normativos/sic-leis-ordinarias', cadastro: 'Leis', tipo: 'Lei Ordinária', midia: 'leis' },
  { path: '/sic-atos-normativos/sic-leis-complementares', cadastro: 'Leis', tipo: 'Lei Complementar', midia: 'leis' },
  { path: '/sic-atos-normativos/sic-lei-organica', cadastro: 'Leis', tipo: 'Lei Orgânica', midia: 'leis' },
  { path: '/sic-atos-normativos/sic-instrucoes-normativas', cadastro: 'Instruções Normativas', tipo: null, midia: 'leis' },
  { path: '/sic-atos-normativos/sic-projetos-de-leis', cadastro: 'Projetos de Lei', tipo: null, midia: 'leis' },
  { path: '/sic-atos-normativos/sic-normas-internas', cadastro: 'Normas Internas', tipo: null, midia: 'leis' },
  { path: '/sic-atos-normativos/lei-de-acesso-a-informacao', cadastro: 'Atos Normativos', tipo: 'Lei de Acesso à Informação', midia: 'leis' },
  { path: '/9-contratos/42-extratos-e-contratos', cadastro: 'Contratos', tipo: 'Contrato', midia: 'contratos' },
  { path: '/9-contratos/49-aditivos', cadastro: 'Contratos', tipo: 'Aditivo', midia: 'contratos' },
  { path: '/9-contratos/50-distratos', cadastro: 'Contratos', tipo: 'Distrato', midia: 'contratos' },
  { path: '/sic-planejamento-orcamentario/ppa', cadastro: 'Planejamento Orçamentário', tipo: 'PPA', midia: 'relatorios' },
  { path: '/sic-planejamento-orcamentario/ldo', cadastro: 'Planejamento Orçamentário', tipo: 'LDO', midia: 'relatorios' },
  { path: '/sic-planejamento-orcamentario/loa', cadastro: 'Planejamento Orçamentário', tipo: 'LOA', midia: 'relatorios' },
  { path: '/sic-balancetes-mensais-2', cadastro: 'Prestação de Contas', tipo: 'Balancete Mensal', midia: 'relatorios' },
  { path: '/sic-balanco-anual-2', cadastro: 'Prestação de Contas', tipo: 'Balanço Anual', midia: 'relatorios' },
  { path: '/sic-lei-de-responsabilidade-fiscal/sic-rgf-2', cadastro: 'Prestação de Contas', tipo: 'RGF', midia: 'relatorios' },
  { path: '/sic-lei-de-responsabilidade-fiscal/sic-rreo-2', cadastro: 'Prestação de Contas', tipo: 'RREO', midia: 'relatorios' },
  { path: '/sic-chamamento-publico', cadastro: 'Chamamento Público', tipo: null, midia: 'editais' },
  { path: '/sic-documentos-diversos-2', cadastro: 'Documentos Diversos', tipo: null, midia: 'editais' },
];

// Coleta recursiva (categoria -> subpaginas de ano -> docs com /download).
async function coletarDocs(path, depth, seen, out) {
  let html;
  try { ({ html } = await getHtml(ORIGEM + path)); } catch (e) { console.log(`  (erro ${path}: ${e.message})`); return out; }
  const $ = cheerio.load(html);

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let abs; try { abs = new URL(href, ORIGEM); } catch { return; }
    if (!/\/download\/?$/.test(abs.pathname)) return;
    const detalhe = abs.pathname.replace(/\/download\/?$/, '');
    const m = detalhe.match(/\/(\d+)-([^/]+)$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push({ id: m[1], slug: m[2], download: abs.href });
    }
  });

  if (depth < 1) {
    const subs = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      let p; try { p = new URL(href, ORIGEM).pathname; } catch { return; }
      if (p.startsWith(path + '/') && /^\/\d+(-|$)/.test(p.slice(path.length)) && !/\/download\/?$/.test(p)) subs.add(p);
    });
    for (const s of subs) await coletarDocs(s, depth + 1, seen, out);
  }
  return out;
}

function tituloDoSlug(slug) {
  return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 200);
}
function parseNumeroAno(slug) {
  const ano = (slug.match(/20\d{2}/) || [])[0];
  const num = (slug.match(/n[º°o]?[-\s]?(\d{1,4})/i) || [])[1];
  return { ano: ano ? Number(ano) : undefined, numero: num && ano ? `${num}/${ano}` : (num || undefined) };
}

async function run() {
  const ledger = await new Ledger('documentos').load();
  const redirects = await new Ledger('redirects').load();
  if (!DRY) await login();
  console.log(`== Documentos: ${CATEGORIAS.length} categorias ${DRY ? '[DRY]' : ''} (LIMIT=${LIMIT}) ==`);

  let novos = 0, pulados = 0, erros = 0;
  for (const cat of CATEGORIAS) {
    const docs = await coletarDocs(cat.path, 0, new Set(), []);
    console.log(`\n[${cat.cadastro}${cat.tipo ? '/' + cat.tipo : ''}] ${cat.path} -> ${docs.length} documentos`);
    if (DRY) { docs.slice(0, 4).forEach((d) => console.log(`   #${d.id} ${tituloDoSlug(d.slug).slice(0, 70)}`)); continue; }
    if (docs.length === 0) continue;

    const cadastroId = await ensureCadastro(cat.cadastro);
    const tipoId = cat.tipo ? await ensureTipo(cadastroId, cat.tipo) : null;

    for (const d of docs) {
      if (novos >= LIMIT) { console.log(`(limite ${LIMIT})`); break; }
      if (ledger.has(d.id)) { pulados++; continue; }
      try {
        const titulo = tituloDoSlug(d.slug);
        const { ano, numero } = parseNumeroAno(d.slug);
        const arquivoUrl = await uploadMidiaFromUrl(d.download, { categoriaSlug: cat.midia, visibilidade: 'publico', nome: `${slugify(titulo).slice(0, 60)}.pdf` });
        await createDocumento({ cadastroId, ...(tipoId ? { tipoId } : {}), titulo, ...(numero ? { numero } : {}), ...(ano ? { ano } : {}), arquivoUrl, situacao: 'vigente' });
        await ledger.set(d.id, { titulo, cadastro: cat.cadastro, tipo: cat.tipo, ano });
        await redirects.set(d.download.replace(ORIGEM, ''), { paraSlug: `documentos`, tipo: 'documento' });
        novos++;
        if (novos % 25 === 0) console.log(`   ... ${novos} documentos importados`);
      } catch (e) {
        erros++;
        console.error(`   ERRO #${d.id}: ${String(e.message).slice(0, 140)}`);
      }
    }
    if (novos >= LIMIT) break;
  }
  console.log(`\n== fim documentos: novos=${novos} pulados=${pulados} erros=${erros} ==`);
}

run().catch((e) => { console.error(e); process.exit(1); });
