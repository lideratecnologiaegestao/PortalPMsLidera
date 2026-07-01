/** Roles do portal de prefeitura. Mantido em sincronia com o enum SQL `user_role`. */
export enum Role {
  SUPER_ADMIN            = 'super_admin',            // plataforma (SaaS), cross-tenant
  ADMIN_PREFEITURA       = 'admin_prefeitura',       // administra todo o tenant (sem acesso a ouvidoria/e-SIC)
  GESTOR                 = 'gestor',                 // gestor de secretaria (sem acesso a ouvidoria/e-SIC)
  OUVIDOR                = 'ouvidor',                // autoridade — vê e gerencia ESIC + Ouvidoria
  ASSISTENTE_OUVIDORIA   = 'assistente_ouvidoria',   // auxiliar da ouvidoria — mesmas permissões de conteúdo que ouvidor
  SERVIDOR               = 'servidor',               // designado a manifestações específicas
  TI                     = 'ti',                     // TI do tenant — acesso técnico pleno EXCETO ouvidoria/e-SIC
  PROFESSOR              = 'professor',              // instrutor da Escola Cidadã — cursos / provas / correção
  CIDADAO                = 'cidadao',                // portal/app do cidadão
}
