/** Roles do portal de prefeitura. Mantido em sincronia com o enum SQL `user_role`. */
export enum Role {
  SUPER_ADMIN = 'super_admin',           // plataforma (SaaS), cross-tenant
  ADMIN_PREFEITURA = 'admin_prefeitura', // administra todo o tenant
  GESTOR = 'gestor',                     // gestor de secretaria
  OUVIDOR = 'ouvidor',                   // trata ESIC + Ouvidoria
  SERVIDOR = 'servidor',                 // designado a manifestações específicas
  CIDADAO = 'cidadao',                   // portal/app do cidadão
}
