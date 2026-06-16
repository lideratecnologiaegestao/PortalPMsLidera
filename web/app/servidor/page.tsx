import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';

const INTERNOS = new Set(['servidor', 'gestor', 'ouvidor', 'admin_prefeitura', 'super_admin']);

/**
 * Entrada do Painel do Servidor. O cidadão também é servidor quando tem papel
 * interno — aqui ele acessa a área de trabalho (atribuições, ouvidoria/e-SIC,
 * chat interno). Sem papel interno, cai no Painel do Cidadão; sem sessão, login.
 *
 * O painel de trabalho do servidor vive sob /admin (shell com sidebar + chat);
 * o acesso a cada módulo é controlado por RBAC. Administradores veem tudo.
 */
export default async function ServidorPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/entrar?redirect=/servidor');
  if (!INTERNOS.has(user.role)) redirect('/cidadao');
  redirect('/admin');
}
