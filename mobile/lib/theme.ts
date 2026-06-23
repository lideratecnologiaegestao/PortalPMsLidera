import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

/**
 * Tema POR TENANT (multi-tenant white-label).
 *
 * Fonte de verdade das cores (em ordem de precedência):
 *   1. AppConfigProvider (GET /api/app-config → tema.primaryColor/secondaryColor)
 *      — injeta via `injetarCoresAppConfig()` após o boot.
 *   2. GET /api/theme (endpoint legado) — mantido como fallback enquanto o
 *      backend não expõe /api/app-config em todos os tenants.
 *   3. Defaults embutidos no código (BASE).
 *
 * Decisão de design (ADR): unificamos em um único ThemeProvider. O AppConfig
 * Provider chama `injetarCoresAppConfig()` assim que a config chega; se vier
 * antes do /api/theme, a app-config prevalece porque substitui `marca`
 * completamente. Se o /api/theme chegar depois, ele NÃO sobrescreve — assim a
 * app-config sempre tem precedência, conforme exigido.
 */

export interface Cores {
  primary: string;
  primaryFg: string;
  secondary: string;
  accent: string;
  bg: string;
  card: string;
  fg: string;
  muted: string;
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

// Garante legibilidade mínima: força primaryFg branco ou preto conforme luminância.
function primaryFgFromColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? '#1b1b1f' : '#ffffff';
}

interface ThemeState {
  c: Cores;
  modo: ModoTema;
  escuro: boolean;
  setModo: (m: ModoTema) => void;
  portal: { nome: string; uf: string; logo?: string };
  carregando: boolean;
  /** Chamado pelo AppConfigProvider para injetar as cores do app-config. */
  injetarCoresAppConfig: (primary: string, secondary: string) => void;
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
  // Flag: true quando a app-config já injetou as cores — bloqueia sobrescrita do /api/theme.
  const [appConfigAtivo, setAppConfigAtivo] = useState(false);
  const [portal, setPortal] = useState({ nome: 'Prefeitura', uf: '' });
  const [carregando, setCarregando] = useState(true);

  // Carrega preferência de modo salva.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_MODO).then((v) => { if (v) setModoState(v as ModoTema); });
  }, []);

  // Busca o /api/theme legado (fallback de cor + portal.nome/uf) EM BACKGROUND.
  // Só aplica se a app-config ainda não injetou cores (appConfigAtivo = false).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/theme`);
        if (res.ok) {
          const data = await res.json();
          // portal.nome e .uf sempre aceitos (não são sobrescritos pela app-config).
          if (data?.portal) setPortal({ nome: data.portal.nome ?? 'Prefeitura', uf: data.portal.uf ?? '' });
          // Cores: só aplica se a app-config ainda não chegou.
          setMarca((prev) => {
            if (appConfigAtivo) return prev; // app-config tem precedência
            const col = data?.tokens?.colors ?? {};
            return {
              primary: col.primary ?? prev.primary,
              primaryFg: col.primaryFg ?? prev.primaryFg,
              secondary: col.secondary ?? prev.secondary,
              accent: col.accent ?? prev.accent,
              success: col.success ?? prev.success,
              warning: col.warning ?? prev.warning,
              danger: col.danger ?? prev.danger,
            };
          });
        }
      } catch { /* offline — mantém defaults */ }
      finally { setCarregando(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // roda só uma vez no boot

  const injetarCoresAppConfig = (primary: string, secondary: string) => {
    setAppConfigAtivo(true);
    setMarca((prev) => ({
      ...prev,
      primary,
      primaryFg: primaryFgFromColor(primary),
      secondary,
    }));
    setCarregando(false);
  };

  const escuro = modo === 'escuro' || (modo === 'auto' && sistema === 'dark');
  const c = escuro ? ESCURO(marca) : CLARO(marca);

  const setModo = (m: ModoTema) => { setModoState(m); AsyncStorage.setItem(STORAGE_MODO, m); };

  return React.createElement(
    ThemeCtx.Provider,
    { value: { c, modo, escuro, setModo, portal, carregando, injetarCoresAppConfig } },
    children,
  );
}
