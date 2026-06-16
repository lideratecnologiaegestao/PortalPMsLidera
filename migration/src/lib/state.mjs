// Livro-razao de idempotencia: mapeia chave de origem (url canonica / id K2 +
// hash do conteudo) -> id criado no destino. Re-rodar NAO duplica (upsert).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = join(ROOT, 'state');

async function existe(p) { try { await access(p); return true; } catch { return false; } }

export class Ledger {
  constructor(nome) { this.path = join(STATE_DIR, `${nome}.json`); this.data = {}; }
  async load() {
    if (await existe(this.path)) this.data = JSON.parse(await readFile(this.path, 'utf8'));
    return this;
  }
  get(key) { return this.data[key]; }
  has(key, hash) { return this.data[key] && (!hash || this.data[key].hash === hash); }
  async set(key, value) {
    this.data[key] = { ...value, at: new Date().toISOString() };
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(this.path, JSON.stringify(this.data, null, 2), 'utf8');
  }
  all() { return this.data; }
}
