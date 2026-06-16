// Verificacao E2E: upload de SVG malicioso -> sanitizacao -> recolorir.
import { login, getJson, postJson, postMultipart } from './lib/api.mjs';

const SVG_MALICIOSO = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" width="100" height="100">
  <script>alert('xss')</script>
  <svg:script>alert('ns')</svg:script>
  <style>rect { fill: url("javascript:alert(1)") }</style>
  <image href="http://evil.example.com/beacon.png" width="1" height="1"/>
  <rect width="100" height="100" fill="#ff0000" onload="alert(2)"/>
  <circle cx="50" cy="50" r="30" fill="#00ff00"/>
</svg>`;

await login();
const cats = await getJson('/api/midia/categorias');
const lista = Array.isArray(cats) ? cats : (cats.items || []);
const cat = lista.find((c) => c.slug === 'logos') || lista.find((c) => c.tipo === 'imagem');
console.log('categoria:', cat.slug);

// 1. upload
const fd = new FormData();
fd.append('file', new Blob([SVG_MALICIOSO], { type: 'image/svg+xml' }), 'teste-malicioso.svg');
fd.append('categoriaId', cat.id);
fd.append('visibilidade', 'publico');
fd.append('altText', 'SVG de teste');
const asset = await postMultipart('/api/midia', fd);
console.log('UPLOAD ok:', asset.id, '| urlPublica:', asset.urlPublica);

// 2. svg-conteudo (sanitizado)
const { conteudo, coresUnicas } = await getJson(`/api/midia/${asset.id}/svg-conteudo`);
const checks = {
  'sem <script>': !/<script/i.test(conteudo),
  'sem svg:script': !/<svg:script/i.test(conteudo),
  'sem onload=': !/onload\s*=/i.test(conteudo),
  'sem <style>': !/<style/i.test(conteudo),
  'image href externo neutralizado': !/<image[^>]+href\s*=\s*["']https?:/i.test(conteudo),
  'cores #ff0000 e #00ff00 detectadas': coresUnicas.includes('#ff0000') && coresUnicas.includes('#00ff00'),
};
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'OK ' : 'FALHOU'} ${k}`);

// 3. recolorir
const novo = await postJson(`/api/midia/${asset.id}/recolorir`, {
  substituicoes: { '#ff0000': '#0000ff' }, categoriaId: cat.id, visibilidade: 'publico', altText: 'recolorido',
});
console.log('RECOLORIR ok:', novo.id, '| nome:', novo.nomeOriginal, '| urlPublica:', novo.urlPublica);

// expoe urls publicas para checar headers via curl
console.log('URLPUB_ORIGINAL=' + asset.urlPublica);
console.log('URLPUB_RECOLOR=' + novo.urlPublica);
