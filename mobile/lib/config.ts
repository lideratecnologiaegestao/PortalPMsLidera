import Constants from 'expo-constants';
import type { NomeIcone } from '../components/icone';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

/**
 * Domínio da prefeitura. A API resolve o tenant pelo Host, então a base é o
 * próprio domínio do município. Definido por EXPO_PUBLIC_API_URL (build) ou em
 * app.config.ts > extra.apiUrl (white-label por tenant).
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? 'https://exemplolandia.lidera.app.br';

/** Slug do tenant (informativo; o isolamento real é pelo Host na API). */
export const TENANT_SLUG = extra.tenantSlug ?? 'exemplolandia';

export interface Categoria { value: string; label: string; icone: NomeIcone }

/** Categorias de demanda urbana (denúncia georreferenciada → Ouvidoria). */
export const CATEGORIAS: Categoria[] = [
  { value: 'buraco_via', label: 'Buraco na via', icone: 'road-variant' },
  { value: 'terreno_abandonado', label: 'Terreno abandonado', icone: 'sprout-outline' },
  { value: 'animal_abandonado', label: 'Animal abandonado', icone: 'paw' },
  { value: 'iluminacao_publica', label: 'Iluminação pública', icone: 'lightbulb-on-outline' },
  { value: 'coleta_lixo', label: 'Lixo / entulho', icone: 'trash-can-outline' },
  { value: 'arvore_risco', label: 'Poda de árvore', icone: 'tree-outline' },
  { value: 'sinalizacao', label: 'Sinalização', icone: 'sign-caution' },
  { value: 'outro', label: 'Outro', icone: 'map-marker-outline' },
];

export const rotuloCategoria = (v: string) => CATEGORIAS.find((c) => c.value === v)?.label ?? v;
export const iconeCategoria = (v: string): NomeIcone => CATEGORIAS.find((c) => c.value === v)?.icone ?? 'map-marker-outline';

/** Tipos de manifestação de Ouvidoria (Lei 13.460/2017). */
export const TIPOS_OUVIDORIA = [
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'denuncia', label: 'Denúncia' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'elogio', label: 'Elogio' },
  { value: 'solicitacao', label: 'Solicitação' },
];

/** Acesso rápido (abre o portal web do município no navegador). */
export const ACESSO_RAPIDO: { titulo: string; icone: NomeIcone; path: string }[] = [
  { titulo: 'Transparência', icone: 'chart-box-outline', path: '/transparencia' },
  { titulo: 'Dados Abertos', icone: 'folder-open-outline', path: '/transparencia/dados-abertos' },
  { titulo: 'Diário Oficial', icone: 'newspaper-variant-outline', path: '/diario' },
  { titulo: 'Serviços', icone: 'file-document-outline', path: '/servicos' },
  { titulo: 'Secretarias', icone: 'bank-outline', path: '/secretarias' },
  { titulo: 'e-SIC', icone: 'file-search-outline', path: '/esic' },
];

export const STATUS_LABEL: Record<string, string> = {
  registrada: 'Registrada', em_analise: 'Em análise', em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Aguardando você', prorrogada: 'Prazo prorrogado', respondida: 'Respondida',
  indeferida: 'Indeferida', parcialmente_atendida: 'Parcialmente atendida',
  recurso_1a_instancia: 'Recurso 1ª inst.', recurso_2a_instancia: 'Recurso 2ª inst.',
  concluida: 'Concluída', arquivada: 'Arquivada', aberto: 'Aberto', resolvido: 'Resolvido',
};
