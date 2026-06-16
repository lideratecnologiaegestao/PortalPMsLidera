import { getPlataformaUser } from '../../lib/platform-server';
import PlataformaLogin from './_components/PlataformaLogin';
import PlataformaShell from './_components/PlataformaShell';

/**
 * Gate do Gerenciador da Plataforma.
 *
 * - Sem usuário autenticado ou role != 'super_admin' → exibe somente
 *   o formulário de login (PlataformaLogin).
 * - Autenticado como super_admin → encapsula children no PlataformaShell.
 *
 * Server Component: chama getPlataformaUser() que usa next/headers.
 */
export default async function PlataformaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPlataformaUser();

  if (!user || user.role !== 'super_admin') {
    return <PlataformaLogin />;
  }

  return <PlataformaShell user={user}>{children}</PlataformaShell>;
}
