/**
 * Tipos do endpoint GET /api/admin/manifestacoes/dashboard
 * (papel ouvidor / assistente_ouvidoria / super_admin).
 */

export interface DashboardKpis {
  total: number;
  abertas: number;
  vencidas: number;
  vencendo48h: number;
  noPrazoPct: number | null;
  tempoMedioDias: number | null;
  satisfacaoMedia: number | null;
  satisfacaoTotal: number;
}

export interface DashboardItem {
  status?: string;
  tipo?: string;
  canal?: string;
  secretaria?: string;
  mes?: string;
  nota?: number;
  total: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  porStatus: DashboardItem[];
  porTipo: DashboardItem[];
  porCanal: DashboardItem[];
  porSecretaria: DashboardItem[];
  serieMensal: DashboardItem[];
  satisfacaoDistribuicao: DashboardItem[];
}

export interface EulaData {
  versao: string;
  titulo: string;
  texto: string;
  jaAceito: boolean;
}
