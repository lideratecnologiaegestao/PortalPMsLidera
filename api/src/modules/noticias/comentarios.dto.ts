import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Body do POST /api/noticias/:id/comentarios (cidadão autenticado). */
export class CriarComentarioDto {
  @IsString()
  @IsNotEmpty({ message: 'O comentário não pode estar vazio.' })
  @MinLength(1, { message: 'O comentário deve ter ao menos 1 caractere.' })
  @MaxLength(2000, { message: 'O comentário pode ter no máximo 2000 caracteres.' })
  conteudo!: string;

  /** Token Cloudflare Turnstile — opcional; se Turnstile desabilitado, ignorado. */
  @IsString()
  @IsOptional()
  turnstileToken?: string;
}

/** Query do GET /api/admin/noticias/comentarios. */
export class ListarComentariosAdminQuery {
  @IsString()
  @IsOptional()
  @IsIn(['pendente', 'aprovado', 'reprovado'])
  status?: string;

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  pageSize?: string;
}
