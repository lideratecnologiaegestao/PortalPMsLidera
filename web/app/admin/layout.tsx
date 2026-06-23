import { getPerfil } from '../../lib/auth';
import AdminLogin from './_components/AdminLogin';
import AdminShell from './_components/AdminShell';
import ChatWidget from '../../components/chat/ChatWidget';

/**
 * Gate + Shell do painel administrativo.
 *
 * - Sem perfil ou papel 'cidadao' -> exibe apenas o formulario de login.
 * - Autenticado com papel de servidor/gestor/admin/ouvidor/assistente_ouvidoria/super_admin
 *   -> encapsula {children} no AdminShell (sidebar + topbar).
 *
 * O root layout (app/layout.tsx) detecta /admin e omite o shell do portal
 * publico, entregando apenas html+body+tema. Este layout adiciona o shell admin.
 *
 * Server Component: usa getPerfil() que requer next/headers.
 *
 * ADR-0005 Fase 1: assistente_ouvidoria entra no painel mas enxerga apenas
 * os itens de menu de Ouvidoria/e-SIC (filtro feito no AdminShell).
 */

const ROLES_PERMITIDOS = new Set([
  'servidor',
  'gestor',
  'admin_prefeitura',
  'ouvidor',
  'assistente_ouvidoria',
  'super_admin',
]);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const perfil = await getPerfil();

  // Nao autenticado ou papel insuficiente: exibe somente o login
  if (!perfil || !ROLES_PERMITIDOS.has(perfil.role)) {
    return <AdminLogin />;
  }

  // Autenticado: renderiza o shell completo + widget de chat interno
  return (
    <>
      <AdminShell perfil={perfil}>{children}</AdminShell>
      <ChatWidget meuId={perfil.id} />
    </>
  );
}
