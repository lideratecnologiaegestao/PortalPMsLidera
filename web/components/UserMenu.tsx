import { getCurrentUser } from '../lib/auth';
import LogoutButton from './LogoutButton';

const INTERNOS = new Set(['servidor', 'gestor', 'ouvidor', 'admin_prefeitura', 'super_admin']);

/**
 * Estado de autenticação no cabeçalho. Server Component: lê o usuário da sessão
 * (cookie). Anônimo → "Entrar" (e-mail+senha OU gov.br em /entrar). Logado →
 * "Painel do Cidadão" + (se for servidor) "Painel do Servidor" + "Sair".
 */
export default async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <a
        href="/entrar?redirect=/cidadao"
        className="rounded bg-primary-fg px-3 py-1 font-semibold text-primary hover:opacity-90"
      >
        Entrar
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <a href="/cidadao" className="underline-offset-2 hover:underline">Cidadão</a>
      {INTERNOS.has(user.role) && (
        <a href="/servidor" className="underline-offset-2 hover:underline">Servidor</a>
      )}
      <LogoutButton />
    </div>
  );
}
