// Carrega os redirects coletados (migration/state/redirects.json) na feature
// de redirects via POST /api/admin/redirects/bulk (upsert idempotente).
import { readFile } from 'node:fs/promises';
import { login, postJson } from './lib/api.mjs';

const data = JSON.parse(await readFile('migration/state/redirects.json', 'utf8'));
const itens = Object.entries(data)
  .filter(([, v]) => v && v.paraSlug)
  .map(([origem, v]) => ({ origem, destino: '/' + String(v.paraSlug).replace(/^\/+/, ''), statusCode: 301 }));

await login();
console.log(`Carregando ${itens.length} redirects...`);
let feito = 0;
for (let i = 0; i < itens.length; i += 500) {
  const chunk = itens.slice(i, i + 500);
  await postJson('/api/admin/redirects/bulk', { itens: chunk });
  feito += chunk.length;
  console.log(`  ${feito}/${itens.length}`);
}
console.log('OK redirects carregados.');
