/**
 * Helpers de controle de acesso para o frontend.
 *
 * IMPORTANTE: estas funções controlam apenas a visibilidade de UI.
 * O controle de acesso real é feito pelo backend (RBAC + RLS).
 * Nunca dependa só deste arquivo para segurança.
 */

/** Papéis que têm acesso ao módulo de Ouvidoria / e-SIC. */
const ROLES_OUVIDORIA = new Set(['ouvidor', 'assistente_ouvidoria', 'super_admin']);

/**
 * Retorna `true` se o papel recebido pode ver os itens de menu
 * de Ouvidoria, e-SIC e Manifestações no painel administrativo.
 *
 * ADR-0005 Fase 1: admin_prefeitura, ti, gestor e servidor NÃO enxergam
 * esses itens de menu (o backend já retorna 403 para esses papéis).
 */
export function podeVerOuvidoria(role: string): boolean {
  return ROLES_OUVIDORIA.has(role);
}

/** Retorna `true` se o papel pode administrar configurações do sistema. */
export function podeAdministrar(role: string): boolean {
  return role === 'admin_prefeitura' || role === 'super_admin';
}

/**
 * Retorna `true` se o papel tem escopo restrito à própria secretaria.
 *
 * ADR-0005 Fase 4: gestor e servidor enxergam apenas o conteúdo da secretaria
 * à qual estão lotados. O backend já força isso via RBAC + RLS; aqui apenas
 * adaptamos a UI para evitar confusão (seletor de secretaria oculto/desabilitado,
 * aviso contextual na listagem).
 */
export function escopoRestrito(role: string): boolean {
  return role === 'gestor' || role === 'servidor';
}
