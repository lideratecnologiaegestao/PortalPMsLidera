import { readFileSync, readdirSync } from 'node:fs';
import { login, getJson, postJson, postMultipart } from './lib/api.mjs';

const svgFile = readdirSync('prompts').find((f) => f.toLowerCase().endsWith('.svg'));
const svg = readFileSync(`prompts/${svgFile}`, 'utf8');
console.log('arquivo:', svgFile, `(${Math.round(svg.length / 1024)} KB)`);

await login();
const cats = await getJson('/api/midia/categorias');
const lista = Array.isArray(cats) ? cats : (cats.items || []);
const cat = lista.find((c) => c.slug === 'brasoes') || lista.find((c) => c.tipo === 'imagem');

const fd = new FormData();
fd.append('file', new Blob([svg], { type: 'image/svg+xml' }), svgFile);
fd.append('categoriaId', cat.id);
fd.append('visibilidade', 'publico');
fd.append('altText', 'Brasão de Barão de Melgaço');
const asset = await postMultipart('/api/midia', fd);
console.log('UPLOAD:', asset.id);
console.log('  nomeOriginal:', asset.nomeOriginal, '(mojibake corrigido?)');
console.log('  urlPublica:', asset.urlPublica);

const { coresUnicas, conteudo } = await getJson(`/api/midia/${asset.id}/svg-conteudo`);
console.log('  coresUnicas:', JSON.stringify(coresUnicas), '| <style> preservado?', /<style/i.test(conteudo));

const novo = await postJson(`/api/midia/${asset.id}/recolorir`, {
  substituicoes: {}, corBase: '#0B5CAD',
  categoriaId: cat.id, visibilidade: 'publico', altText: 'Brasão recolorido (azul do tema)',
});
console.log('RECOLOR copy:', novo.id, '| url:', novo.urlPublica);
console.log('URLPUB_RECOLOR=' + novo.urlPublica);
console.log('ASSET_ORIG=' + asset.id);
console.log('ASSET_COPY=' + novo.id);
