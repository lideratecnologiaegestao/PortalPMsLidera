// Importa as paginas institucionais do Joomla -> Paginas CMS da plataforma.
// Idempotente (ledger por slug). DRY: MIG_DRY=1 so raspa+limpa e imprime (nao posta).
import { ORIGEM, getHtml } from './lib/http.mjs';
import { limparItemK2 } from './lib/clean.mjs';
import { login, rehospedarHtml, upsertPaginaCms } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const DRY = process.env.MIG_DRY === '1';
const FORCE = process.env.MIG_FORCE === '1';

// de-para: caminho antigo -> { slug novo, titulo, categoria de midia p/ imagens inline }
const PAGINAS = [
  { de: '/historia',        slug: 'institucional/historia',        titulo: 'História do Município' },
  { de: '/economia',        slug: 'institucional/economia',        titulo: 'Economia' },
  { de: '/demografia',      slug: 'institucional/demografia',      titulo: 'Demografia' },
  { de: '/simbolos-e-hinos', slug: 'institucional/simbolos-e-hino', titulo: 'Símbolos e Hino' },
  { de: '/ex-prefeitos',    slug: 'institucional/ex-prefeitos',    titulo: 'Ex-Prefeitos' },
  { de: '/prefeita',        slug: 'institucional/prefeita',        titulo: 'Prefeita' },
  { de: '/vice-prefeito',   slug: 'institucional/vice-prefeito',   titulo: 'Vice-Prefeito' },
];

async function run() {
  const ledger = await new Ledger('institucional').load();
  const redirects = await new Ledger('redirects').load();
  if (!DRY) await login();
  console.log(`== Institucional (${PAGINAS.length} paginas) ${DRY ? '[DRY]' : ''} ==`);

  for (const p of PAGINAS) {
    try {
      if (!FORCE && ledger.has(p.slug)) { console.log(`SKIP (ja importado): ${p.slug}`); continue; }
      const { html: cru } = await getHtml(ORIGEM + p.de);
      const { html, titulo: tituloRaspado, imagens } = limparItemK2(cru, { origem: ORIGEM });
      const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (DRY) {
        console.log(`\n--- ${p.de}  ->  /${p.slug}`);
        console.log(`titulo raspado: ${tituloRaspado || '(vazio)'}`);
        console.log(`imagens inline: ${imagens.length}`);
        console.log(`corpo (texto, ${texto.length} chars): ${texto.slice(0, 260)}...`);
        continue;
      }

      if (texto.length < 40) { console.log(`AVISO conteudo curto (${texto.length}) em ${p.de} — revisar manual`); }
      const corpoHtml = await rehospedarHtml(html, { categoriaSlug: 'noticias' });

      const { id, criado } = await upsertPaginaCms({ slug: p.slug, titulo: p.titulo, corpoHtml });

      await ledger.set(p.slug, { pageId: id, origem: p.de });
      await redirects.set(p.de, { paraSlug: p.slug, tipo: 'cms' });
      console.log(`OK  ${p.de}  ->  /${p.slug}  (${criado ? 'criada' : 'atualizada'} ${id})`);
    } catch (e) {
      console.error(`ERRO ${p.de}: ${e.message}`);
    }
  }
  console.log('== fim institucional ==');
}

run().catch((e) => { console.error(e); process.exit(1); });
