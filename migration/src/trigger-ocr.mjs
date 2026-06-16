import { login, postJson } from './lib/api.mjs';
await login();
try {
  const r = await postJson('/api/admin/documentos/_reextrair-escaneados', {});
  console.log('BACKFILL OCR disparado:', JSON.stringify(r));
} catch (e) {
  console.log('erro:', String(e.message).slice(0, 200));
}
