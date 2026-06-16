import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

/**
 * Autenticação do CIDADÃO (e-mail + senha, sem gov.br obrigatório). O token de
 * sessão (JWT do backend) é guardado localmente e enviado como Bearer. O gov.br
 * continua disponível como opção (abre no navegador do portal).
 */
export interface Usuario { id: string; nome: string }

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  carregando: boolean;
  cadastrar: (d: { nome: string; email: string; telefone?: string; senha: string }) => Promise<{ precisaVerificar: { email: boolean; telefone: boolean }; emailEnviado: boolean; telefoneEnviado: boolean }>;
  verificar: (email: string, finalidade: 'email' | 'telefone', codigo: string) => Promise<void>;
  reenviar: (email: string, finalidade: 'email' | 'telefone') => Promise<void>;
  login: (email: string, senha: string) => Promise<void>;
  recuperar: (email: string) => Promise<void>;
  redefinir: (email: string, codigo: string, novaSenha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const KEY_TOKEN = 'auth.token';
const KEY_USER = 'auth.user';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/auth/cidadao${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = (data as any)?.message;
    throw new Error(Array.isArray(m) ? m.join('; ') : String(m ?? `Erro ${res.status}`));
  }
  return data as T;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
};

/** Token atual (para chamadas autenticadas fora do contexto). */
export async function tokenAtual(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_TOKEN);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, u] = await Promise.all([AsyncStorage.getItem(KEY_TOKEN), AsyncStorage.getItem(KEY_USER)]);
      if (t) setToken(t);
      if (u) setUsuario(JSON.parse(u));
      setCarregando(false);
    })();
  }, []);

  const cadastrar: AuthState['cadastrar'] = (d) => post('/cadastro', d);
  const verificar: AuthState['verificar'] = async (email, finalidade, codigo) => { await post('/verificar', { email, finalidade, codigo }); };
  const reenviar: AuthState['reenviar'] = async (email, finalidade) => { await post('/reenviar', { email, finalidade }); };
  const recuperar: AuthState['recuperar'] = async (email) => { await post('/recuperar', { email }); };
  const redefinir: AuthState['redefinir'] = async (email, codigo, novaSenha) => { await post('/redefinir', { email, codigo, novaSenha }); };

  const login: AuthState['login'] = async (email, senha) => {
    const r = await post<{ token: string; user: Usuario }>('/login', { email, senha });
    await AsyncStorage.setItem(KEY_TOKEN, r.token);
    await AsyncStorage.setItem(KEY_USER, JSON.stringify(r.user));
    setToken(r.token);
    setUsuario(r.user);
  };

  const sair: AuthState['sair'] = async () => {
    await AsyncStorage.multiRemove([KEY_TOKEN, KEY_USER]);
    setToken(null);
    setUsuario(null);
  };

  return React.createElement(
    Ctx.Provider,
    { value: { token, usuario, carregando, cadastrar, verificar, reenviar, login, recuperar, redefinir, sair } },
    children,
  );
}
