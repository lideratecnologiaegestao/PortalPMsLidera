import { IsIn } from 'class-validator';

export type PerfilBuild = 'preview' | 'production';

/** Body do POST /api/admin/app-config/builds */
export class SolicitarBuildDto {
  @IsIn(['preview', 'production'], {
    message: 'perfil deve ser "preview" ou "production".',
  })
  perfil!: PerfilBuild;
}
