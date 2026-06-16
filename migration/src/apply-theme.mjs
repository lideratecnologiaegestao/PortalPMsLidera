// Aplica um preset de tema + ajusta a cor dos cards p/ combinar.
// Uso: node apply-theme.mjs [preset]   (default: sapezal)
import { login, postJson, putJson, getJson } from './lib/api.mjs';

const PRIMARY = {
  sapezal: '#0B5CAD', 'sao-mateus-do-sul': '#14306B', 'cachoeira-do-sul': '#1C3D5A',
  betim: '#0D47A1', 'sao-francisco-de-paula': '#14538A', 'alto-garcas': '#105E8A', inocencia: '#0F2A4A',
};
const id = process.argv[2] || 'sapezal';

await login();
const r = await postJson('/api/theme/aplicar-modelo', { id });
console.log(`tema "${id}" aplicado.`);

const cfg = await getJson('/api/admin/home/config');
const { tenantId, ...rest } = cfg || {};
await putJson('/api/admin/home/config', { ...rest, cardCorDestaque: PRIMARY[id] || '#0B5CAD' });
console.log(`cardCorDestaque -> ${PRIMARY[id] || '#0B5CAD'}`);
