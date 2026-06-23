import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';
import type { NomeIcone } from '../components/icone';

// ─── Tipos do contrato GET /api/app-config ───────────────────────────────────

export interface AppConfigTema {
  primaryColor: string;
  secondaryColor: string;
}

export interface AppConfigModulos {
  denuncia: boolean;
  mapa: boolean;
  ouvidoria: boolean;
  esic: boolean;
  chat: boolean;
  servicos: boolean;
  noticias: boolean;
  carteira: boolean;
  galeria: boolean;
  documentos: boolean;
}

export interface AppConfigSlide {
  titulo: string;
  descricao: string;
  imagemUrl: string;
}

export interface AppConfigOnboarding {
  ativo: boolean;
  slides: AppConfigSlide[];
}

export interface AcessoRapidoItem {
  titulo: string;
  path: string;
  icone: NomeIcone;
}

export interface CategoriaItem {
  value: string;
  label: string;
  icone: NomeIcone;
}

export interface AppConfig {
  appName: string;
  appShortName: string;
  logoUrl?: string;
  iconUrl?: string;
  splashUrl?: string;
  splashBgColor?: string;
  tema: AppConfigTema;
  modulos: AppConfigModulos;
  onboarding: AppConfigOnboarding;
  acessoRapido: AcessoRapidoItem[];
  categoriasChamados: CategoriaItem[];
  push: { habilitado: boolean };
  biometria: { habilitada: boolean };
}

// ─── Defaults (app NUNCA quebra sem a config da API) ─────────────────────────

export const APP_CONFIG_DEFAULTS: AppConfig = {
  appName: 'Portal do Cidadão',
  appShortName: 'Cidadão',
  tema: { primaryColor: '#1351b4', secondaryColor: '#2670e8' },
  modulos: {
    denuncia: true, mapa: true, ouvidoria: true, esic: true,
    chat: true, servicos: true, noticias: true, carteira: false,
    galeria: true, documentos: true,
  },
  onboarding: { ativo: false, slides: [] },
  acessoRapido: [
    { titulo: 'Transparência', icone: 'chart-box-outline', path: '/transparencia' },
    { titulo: 'Dados Abertos', icone: 'folder-open-outline', path: '/transparencia/dados-abertos' },
    { titulo: 'Diário Oficial', icone: 'newspaper-variant-outline', path: '/diario' },
    { titulo: 'Serviços', icone: 'file-document-outline', path: '/servicos' },
    { titulo: 'Secretarias', icone: 'bank-outline', path: '/secretarias' },
    { titulo: 'e-SIC', icone: 'file-search-outline', path: '/esic' },
  ],
  categoriasChamados: [
    { value: 'buraco_via', label: 'Buraco na via', icone: 'road-variant' },
    { value: 'terreno_abandonado', label: 'Terreno abandonado', icone: 'sprout-outline' },
    { value: 'animal_abandonado', label: 'Animal abandonado', icone: 'paw' },
    { value: 'iluminacao_publica', label: 'Iluminação pública', icone: 'lightbulb-on-outline' },
    { value: 'coleta_lixo', label: 'Lixo / entulho', icone: 'trash-can-outline' },
    { value: 'arvore_risco', label: 'Poda de árvore', icone: 'tree-outline' },
    { value: 'sinalizacao', label: 'Sinalização', icone: 'sign-caution' },
    { value: 'outro', label: 'Outro', icone: 'map-marker-outline' },
  ],
  push: { habilitado: true },
  biometria: { habilitada: false },
};

// ─── Cache AsyncStorage ───────────────────────────────────────────────────────

const CACHE_KEY = 'app_config_cache';
const CACHE_TS_KEY = 'app_config_cache_ts';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

async function lerCache(): Promise<AppConfig | null> {
  try {
    const [raw, tsRaw] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(CACHE_TS_KEY),
    ]);
    if (!raw) return null;
    const ts = tsRaw ? Number(tsRaw) : 0;
    if (Date.now() - ts > TTL_MS) return null; // expirado — vai à rede
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

async function gravarCache(config: AppConfig): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [CACHE_KEY, JSON.stringify(config)],
      [CACHE_TS_KEY, String(Date.now())],
    ]);
  } catch { /* storage cheio — ignora silenciosamente */ }
}

async function lerCacheIgnorandoTTL(): Promise<AppConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppConfig) : null;
  } catch {
    return null;
  }
}

// ─── Busca na rede ────────────────────────────────────────────────────────────

async function fetchAppConfig(): Promise<AppConfig> {
  const res = await fetch(`${API_URL}/api/app-config`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`app-config HTTP ${res.status}`);
  const data = await res.json();

  // Mescla com defaults para garantir todos os campos — backward-compat.
  return {
    ...APP_CONFIG_DEFAULTS,
    ...data,
    tema: { ...APP_CONFIG_DEFAULTS.tema, ...(data.tema ?? {}) },
    modulos: { ...APP_CONFIG_DEFAULTS.modulos, ...(data.modulos ?? {}) },
    onboarding: { ...APP_CONFIG_DEFAULTS.onboarding, ...(data.onboarding ?? {}) },
    acessoRapido: Array.isArray(data.acessoRapido) && data.acessoRapido.length > 0
      ? data.acessoRapido
      : APP_CONFIG_DEFAULTS.acessoRapido,
    categoriasChamados: Array.isArray(data.categoriasChamados) && data.categoriasChamados.length > 0
      ? data.categoriasChamados
      : APP_CONFIG_DEFAULTS.categoriasChamados,
    push: { ...APP_CONFIG_DEFAULTS.push, ...(data.push ?? {}) },
    biometria: { ...APP_CONFIG_DEFAULTS.biometria, ...(data.biometria ?? {}) },
  } as AppConfig;
}

// ─── Boot: cache válido → imediato; depois tenta rede em background ───────────

export async function carregarAppConfig(): Promise<AppConfig> {
  // 1. Cache válido (dentro do TTL) — retorna imediatamente.
  const cached = await lerCache();
  if (cached) {
    // Atualiza em background sem bloquear a UI.
    fetchAppConfig()
      .then(gravarCache)
      .catch(() => undefined);
    return cached;
  }

  // 2. Sem cache válido — tenta a rede.
  try {
    const fresh = await fetchAppConfig();
    await gravarCache(fresh);
    return fresh;
  } catch {
    // 3. Offline / erro — usa cache expirado ou defaults.
    const stale = await lerCacheIgnorandoTTL();
    return stale ?? APP_CONFIG_DEFAULTS;
  }
}

// ─── Contexto React ───────────────────────────────────────────────────────────

interface AppConfigState {
  config: AppConfig;
  carregando: boolean;
  /** true quando está usando dados em cache ou defaults (sem confirmação da rede). */
  offline: boolean;
}

const AppConfigCtx = createContext<AppConfigState | null>(null);

export function useAppConfig(): AppConfigState {
  const v = useContext(AppConfigCtx);
  if (!v) throw new Error('useAppConfig fora do AppConfigProvider');
  return v;
}

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(APP_CONFIG_DEFAULTS);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let montado = true;
    (async () => {
      try {
        const resultado = await carregarAppConfig();
        if (montado) {
          setConfig(resultado);
          setOffline(false);
        }
      } catch {
        // carregarAppConfig já trata internamente — nunca deve chegar aqui,
        // mas por segurança mantemos os defaults já setados.
        if (montado) setOffline(true);
      } finally {
        if (montado) setCarregando(false);
      }
    })();
    return () => { montado = false; };
  }, []);

  return React.createElement(
    AppConfigCtx.Provider,
    { value: { config, carregando, offline } },
    children,
  );
}
