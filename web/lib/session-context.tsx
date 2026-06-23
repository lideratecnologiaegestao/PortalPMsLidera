'use client';

/**
 * Contexto de sessão do painel admin.
 *
 * O AdminShell (Server Component) passa o perfil como prop para o
 * AdminShellClient (Client Component), que popula este contexto.
 * Client Components filhos podem ler o papel sem fazer novo fetch.
 *
 * Expõe apenas role e id (minimização LGPD).
 */

import { createContext, useContext } from 'react';

export interface SessaoAdmin {
  id: string;
  role: string;
}

const SessaoContext = createContext<SessaoAdmin | null>(null);

export function SessaoAdminProvider({
  sessao,
  children,
}: {
  sessao: SessaoAdmin;
  children: React.ReactNode;
}) {
  return (
    <SessaoContext.Provider value={sessao}>
      {children}
    </SessaoContext.Provider>
  );
}

/**
 * Retorna a sessão do usuário logado.
 * Deve ser usado apenas dentro do AdminShell.
 */
export function useSessaoAdmin(): SessaoAdmin {
  const ctx = useContext(SessaoContext);
  if (!ctx) {
    throw new Error('useSessaoAdmin deve ser usado dentro do AdminShell');
  }
  return ctx;
}
