/**
 * Catálogo canônico de permissões granulares.
 * Fonte da verdade do sistema de grupos de acesso.
 *
 * Estrutura: { key, modulo, label }
 * key = "<modulo>.gerenciar"
 */

export type PermissionKey = string;

export const WILDCARD = '*';

export interface PermissaoDefinicao {
  key: PermissionKey;
  modulo: string;
  label: string;
}

export const PERMISSOES: PermissaoDefinicao[] = [
  // Conteúdo editorial
  { key: 'noticias.gerenciar',      modulo: 'Notícias',        label: 'Gerenciar Notícias' },
  { key: 'banners.gerenciar',       modulo: 'Banners',         label: 'Gerenciar Banners' },
  { key: 'galeria.gerenciar',       modulo: 'Galeria',         label: 'Gerenciar Galeria de Fotos e Vídeos' },
  { key: 'secretarias.gerenciar',   modulo: 'Secretarias',     label: 'Gerenciar Secretarias' },
  { key: 'servicos.gerenciar',      modulo: 'Serviços',        label: 'Gerenciar Carta de Serviços' },
  { key: 'popups.gerenciar',        modulo: 'Popups',          label: 'Gerenciar Popups do Portal' },
  { key: 'menus.gerenciar',         modulo: 'Menus',           label: 'Gerenciar Menus de Navegação' },
  { key: 'tema.gerenciar',          modulo: 'Tema',            label: 'Gerenciar Tema e Identidade Visual' },
  { key: 'configuracoes.gerenciar', modulo: 'Configurações',   label: 'Gerenciar Configurações Gerais' },

  // Documentos e atos oficiais
  { key: 'documentos.gerenciar',    modulo: 'Documentos',      label: 'Gerenciar Documentos Oficiais' },
  { key: 'licitacoes.gerenciar',    modulo: 'Licitações',      label: 'Gerenciar Licitações' },
  { key: 'contratos.gerenciar',     modulo: 'Contratos',       label: 'Gerenciar Contratos' },
  { key: 'convenios.gerenciar',     modulo: 'Convênios',       label: 'Gerenciar Convênios' },
  { key: 'conselhos.gerenciar',     modulo: 'Conselhos',       label: 'Gerenciar Conselhos Municipais' },
  { key: 'concursos.gerenciar',     modulo: 'Concursos',       label: 'Gerenciar Concursos e Seletivos' },
  { key: 'transparencia.gerenciar', modulo: 'Transparência',   label: 'Gerenciar Portal da Transparência' },

  // Atendimento ao cidadão
  { key: 'ouvidoria.gerenciar',     modulo: 'Ouvidoria',       label: 'Gerenciar Ouvidoria e e-SIC' },
  { key: 'formularios.gerenciar',   modulo: 'Formulários',     label: 'Gerenciar formulários' },

  // Administração
  { key: 'usuarios.gerenciar',      modulo: 'Usuários',        label: 'Gerenciar Usuários do Tenant' },
  { key: 'grupos.gerenciar',        modulo: 'Grupos',          label: 'Gerenciar Grupos de Acesso' },
];

/** Todas as chaves de permissão como array de strings. */
export const PERMISSION_KEYS: string[] = PERMISSOES.map((p) => p.key);

/** Chaves de conteúdo (tudo exceto usuários e grupos). */
const CONTENT_KEYS: string[] = PERMISSION_KEYS.filter(
  (k) => k !== 'usuarios.gerenciar' && k !== 'grupos.gerenciar',
);

/** Retorna true se a chave for válida no catálogo. */
export function isPermissionValida(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}

/**
 * Permissões implícitas por papel (não exigem grupo).
 * '*' = curinga total (acesso a tudo).
 */
export const ROLE_DEFAULTS: Record<string, string[]> = {
  super_admin:       [WILDCARD],
  admin_prefeitura:  [WILDCARD],
  gestor:            [...CONTENT_KEYS],
  ouvidor:           ['ouvidoria.gerenciar'],
  servidor:          [],
  cidadao:           [],
};
