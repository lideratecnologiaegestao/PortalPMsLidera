// Importa os banners hero reais do site antigo -> modulo Banners (com imagem
// re-hospedada). Remove os banners-semente (sem imagem). Idempotente por URL.
import { login, getJson, postJson, delJson, uploadMidiaFromUrl } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const BASE = 'https://www.baraodemelgaco.mt.gov.br';
const BANNERS = [
  { img: `${BASE}/arquivos/2023/10/04/gws_banner_ok.jpg`, titulo: 'Bem-vindo ao Portal de Barão de Melgaço', subtitulo: 'Serviços, transparência e ouvidoria em um só lugar', ordem: 0 },
  { img: `${BASE}/arquivos/2023/10/04/gws_banner_02.jpg`, titulo: 'Prefeitura de Barão de Melgaço', ordem: 1 },
  { img: `${BASE}/arquivos/2023/11/07/gws_banner_audiencias_pref.jpg`, titulo: 'Audiências Públicas', linkUrl: '/transparencia/documentos', ordem: 2 },
  { img: `${BASE}/arquivos/2023/11/07/gws_banner-leis_municipais-barao.jpg`, titulo: 'Legislação Municipal', linkUrl: '/documentos/leis', ordem: 3 },
  { img: `${BASE}/arquivos/2023/11/07/gws_banner_lei_paulo.jpg`, titulo: 'Lei Paulo Gustavo — Cultura', ordem: 4 },
  { img: `${BASE}/arquivos/2023/11/07/gws_banner_lei_aldir.jpg`, titulo: 'Lei Aldir Blanc — Cultura', ordem: 5 },
];

async function run() {
  await login();
  const ledger = await new Ledger('banners').load();

  // Remove banners-semente (texto, sem imagem) — limpa a home
  const ex = await getJson('/api/admin/banners');
  const lista = Array.isArray(ex) ? ex : (ex.items || []);
  for (const b of lista) {
    if (!b.imagemUrl) { try { await delJson(`/api/admin/banners/${b.id}`); console.log(`removido banner-semente: ${b.titulo}`); } catch {} }
  }

  for (const b of BANNERS) {
    if (ledger.has(b.img)) { console.log(`SKIP (ja importado): ${b.titulo}`); continue; }
    try {
      const imagemUrl = await uploadMidiaFromUrl(b.img, { alt: b.titulo, categoriaSlug: 'banners' });
      const novo = await postJson('/api/admin/banners', {
        titulo: b.titulo, ...(b.subtitulo ? { subtitulo: b.subtitulo } : {}),
        imagemUrl, ...(b.linkUrl ? { linkUrl: b.linkUrl } : {}),
        ativo: true, ordem: b.ordem,
      });
      await ledger.set(b.img, { id: novo.id, titulo: b.titulo });
      console.log(`OK  banner: ${b.titulo}  -> ${imagemUrl}`);
    } catch (e) { console.error(`ERRO ${b.titulo}: ${String(e.message).slice(0, 160)}`); }
  }
  console.log('== fim banners ==');
}
run().catch((e) => { console.error(e); process.exit(1); });
