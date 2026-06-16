/** Conjuntos publicados com endpoint próprio. */
export type Dataset = 'despesas' | 'receitas' | 'folha';

/** Filtros comuns de consulta pública. */
export interface ConsultaQuery {
  ano?: number;
  mes?: number;
  orgao?: string;
  cargo?: string;
  credor?: string;
  page?: number;
  pageSize?: number;
}

/** Payload de sincronização vindo do n8n (linhas no formato canônico snake_case). */
export interface SyncPayload {
  dataset: Dataset;
  origem?: string;
  registros: Record<string, unknown>[];
}

/** Dados do job de ETL na fila `integracoes`. */
export interface TransparenciaSyncJob {
  tenantId: string;
  dataset: Dataset;
  origem?: string;
  registros: Record<string, unknown>[];
}
