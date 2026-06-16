'use client';

import { apiBase } from '../lib/auth-shared';

/** Encerra a sessão (POST /auth/govbr/logout) e recarrega a página. */
export default function LogoutButton() {
  async function sair() {
    await fetch(`${apiBase}/api/auth/govbr/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    window.location.assign('/');
  }
  return (
    <button
      type="button"
      onClick={sair}
      className="rounded border border-primary-fg px-3 py-1 hover:bg-primary-fg hover:text-primary"
    >
      Sair
    </button>
  );
}
