/**
 * Catálogo canônico de permissões granulares.
 * Fonte da verdade do sistema de grupos de acesso.
 *
 * Estrutura: { key, modulo, label }
 * key = "<modulo>.gerenciar"
 *
 * ADR-0005: admin_prefeitura e gestor/ti NÃO recebem ouvidoria.gerenciar
 * nem esic.gerenciar. Apenas ouvidor e assistente_ouvidoria acessam esses
 * módulos. O wildcard '*' está reservado exclusivamente ao super_admin.
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

  // Atendimento ao cidadão — conteúdo geral (visível para admin/gestor/ti/servidor)
  { key: 'formularios.gerenciar',   modulo: 'Formulários',     label: 'Gerenciar formulários' },

  // Ouvidoria e e-SIC — EXCLUSIVO ouvidor/assistente_ouvidoria (ADR-0005)
  { key: 'ouvidoria.gerenciar',     modulo: 'Ouvidoria',       label: 'Gerenciar Ouvidoria' },
  { key: 'esic.gerenciar',          modulo: 'e-SIC',           label: 'Gerenciar e-SIC (Lei de Acesso à Informação)' },

  // Administração
  { key: 'usuarios.gerenciar',      modulo: 'Usuários',        label: 'Gerenciar Usuários do Tenant' },
  { key: 'grupos.gerenciar',        modulo: 'Grupos',          label: 'Gerenciar Grupos de Acesso' },
];

/** Todas as chaves de permissão como array de strings. */
export const PERMISSION_KEYS: string[] = PERMISSOES.map((p) => p.key);

/**
 * Chaves de conteúdo geral (tudo exceto usuários, grupos, ouvidoria e e-SIC).
 * Usada por admin_prefeitura, gestor e ti.
 */
const CONTENT_KEYS_GERAL: string[] = PERMISSION_KEYS.filter(
  (k) =>
    k !== 'usuarios.gerenciar' &&
    k !== 'grupos.gerenciar' &&
    k !== 'ouvidoria.gerenciar' &&
    k !== 'esic.gerenciar',
);

/** Retorna true se a chave for válida no catálogo. */
export function isPermissionValida(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}

/**
 * Permissões implícitas por papel (não exigem grupo).
 *
 * Regras ADR-0005:
 *   - super_admin: wildcard total (cross-tenant, via platform())
 *   - admin_prefeitura: tudo de conteúdo EXCETO ouvidoria/e-SIC + usuários/grupos
 *   - ti: idêntico ao admin_prefeitura — acesso técnico, sem ouvidoria/e-SIC
 *   - gestor: conteúdo geral (sem ouvidoria/e-SIC, sem usuários/grupos)
 *   - ouvidor: somente ouvidoria.gerenciar + esic.gerenciar
 *   - assistente_ouvidoria: idem ouvidor
 *   - servidor: sem permissões implícitas (recebe via grupos)
 *   - cidadao: sem permissões (portal público)
 */
export const ROLE_DEFAULTS: Record<string, string[]> = {
  super_admin:          [WILDCARD],
  admin_prefeitura:     [...CONTENT_KEYS_GERAL, 'usuarios.gerenciar', 'grupos.gerenciar'],
  ti:                   [...CONTENT_KEYS_GERAL, 'usuarios.gerenciar', 'grupos.gerenciar'],
  gestor:               [...CONTENT_KEYS_GERAL],
  ouvidor:              ['ouvidoria.gerenciar', 'esic.gerenciar'],
  assistente_ouvidoria: ['ouvidoria.gerenciar', 'esic.gerenciar'],
  servidor:             [],
  cidadao:              [],
};
