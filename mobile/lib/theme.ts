import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

/**
 * Tema POR TENANT (multi-tenant white-label). As cores da marca vêm da API
 * (`GET /api/theme`, resolvida pelo Host do município) em runtime — trocar a
 * cor de uma prefeitura NÃO exige rebuild. O modo claro/escuro deriva dessas
 * cores e respeita a preferência do usuário (claro/escuro/automático).
 */

export interface Cores {
  primary: string;
  primaryFg: string;
  secondary: string;
  accent: string;
  bg: string;        // fundo da tela
  card: string;      // fundo de cartões
  fg: string;        // texto principal
  muted: string;     // texto secundário
  border: string;
  success: string;
  warning: string;
  danger: string;
}

export type ModoTema = 'claro' | 'escuro' | 'auto';

const BASE = {
  primary: '#1351b4', primaryFg: '#ffffff', secondary: '#2670e8', accent: '#168821',
  success: '#168821', warning: '#b88c00', danger: '#b30000',
};

const CLARO = (b: typeof BASE): Cores => ({
  ...b, bg: '#f5f6f8', card: '#ffffff', fg: '#1b1b1f', muted: '#5a5f6a', border: '#e2e5ea',
});
const ESCURO = (b: typeof BASE): Cores => ({
  ...b, primaryFg: '#ffffff', bg: '#0f1115', card: '#181b21', fg: '#e8eaed', muted: '#9aa0ab', border: '#2a2e37',
});

interface ThemeState {
  c: Cores;
  modo: ModoTema;
  escuro: boolean;
  setModo: (m: ModoTema) => void;
  portal: { nome: string; uf: string; logo?: string };
  carregando: boolean;
}

const ThemeCtx = createContext<ThemeState | null>(null);
export const useTheme = () => {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error('useTheme fora do ThemeProvider');
  return t;
};

const STORAGE_MODO = 'tema.modo';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sistema = useColorScheme();
  const [modo, setModoState] = useState<ModoTema>('auto');
  const [marca, setMarca] = useState(BASE);
  const [portal, setPortal] = useState({ nome: 'Prefeitura', uf: '' });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_MODO).then((v) => { if (v) setModoState(v as ModoTema); });
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/theme`);
        if (res.ok) {
          const data = await res.json();
          const col = data?.tokens?.colors ?? {};
          setMarca({
            primary: col.primary ?? BASE.primary,
            primaryFg: col.primaryFg ?? BASE.primaryFg,
            secondary: col.secondary ?? BASE.secondary,
            accent: col.accent ?? BASE.accent,
            success: col.success ?? BASE.success,
            warning: col.warning ?? BASE.warning,
            danger: col.danger ?? BASE.danger,
          });
          if (data?.portal) setPortal({ nome: data.portal.nome ?? 'Prefeitura', uf: data.portal.uf ?? '' });
        }
      } catch {
        /* mantém o tema base se a API não responder */
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const escuro = modo === 'escuro' || (modo === 'auto' && sistema === 'dark');
  const c = escuro ? ESCURO(marca) : CLARO(marca);

  const setModo = (m: ModoTema) => { setModoState(m); AsyncStorage.setItem(STORAGE_MODO, m); };

  return React.createElement(
    ThemeCtx.Provider,
    { value: { c, modo, escuro, setModo, portal, carregando } },
    children,
  );
}
