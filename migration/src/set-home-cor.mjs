// Colore os cards do Acesso Rapido (cardCorDestaque) + ajustes da home.
import { login, getJson, putJson } from './lib/api.mjs';

await login();
const cfg = await getJson('/api/admin/home/config');
const { tenantId, ...rest } = cfg || {};
const novo = {
  ...rest,
  cardCorDestaque: '#105E8A', // cor institucional nos cards (era null = branco)
  arColunas: 2,               // 2 colunas de acesso rapido (mais denso/colorido)
  cardIconeForma: 'circulo',
};
const r = await putJson('/api/admin/home/config', novo);
console.log('config salva. cardCorDestaque=', r?.cardCorDestaque ?? novo.cardCorDestaque, '| arColunas=', r?.arColunas ?? novo.arColunas);
