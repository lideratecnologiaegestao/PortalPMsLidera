// Config do ETL. Credenciais via env (NUNCA commitar senha):
//   $env:MIG_EMAIL='admin@barao.lidera.srv.br'; $env:MIG_SENHA='...'; npm run import:institucional
export const API_BASE = process.env.MIG_API_BASE || 'https://barao.lidera.srv.br';
export const TENANT_HOST = process.env.MIG_TENANT_HOST || 'barao.lidera.srv.br';
export const ADMIN_EMAIL = process.env.MIG_EMAIL || 'admin@barao.lidera.srv.br';
export const ADMIN_SENHA = process.env.MIG_SENHA || '';

if (!ADMIN_SENHA) {
  console.error('Defina MIG_SENHA (senha do admin do tenant) no ambiente antes de rodar.');
  process.exit(1);
}
