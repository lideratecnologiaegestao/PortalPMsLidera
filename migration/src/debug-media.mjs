import { ORIGEM, getHtml } from './lib/http.mjs';
import { limparItemK2 } from './lib/clean.mjs';
import { login, getJson, uploadMidiaFromUrl } from './lib/api.mjs';

await login();
console.log('login OK');

const cats = await getJson('/api/midia/categorias');
console.log('categorias (tipo):', JSON.stringify(cats).slice(0, 600));

const { html: cru } = await getHtml(ORIGEM + '/economia');
const { imagens } = limparItemK2(cru, { origem: ORIGEM });
console.log('imagens detectadas:', imagens.map((i) => i.src));

if (imagens[0]) {
  try {
    const url = await uploadMidiaFromUrl(imagens[0].src, { alt: imagens[0].alt || 'teste', categoriaSlug: 'noticias' });
    console.log('UPLOAD OK ->', url);
  } catch (e) {
    console.error('UPLOAD FALHOU ->', e.message);
  }
}
