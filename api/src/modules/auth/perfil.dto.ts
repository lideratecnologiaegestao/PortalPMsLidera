import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Body do PATCH /auth/me/perfil.
 * Todos os campos são opcionais; a validação cruzada
 * (senhaAtual obrigatória quando novaSenha presente) é feita no service.
 */
export class AtualizarPerfilDto {
  @IsOptional()
  @IsString({ message: 'Nome deve ser uma string.' })
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nome?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @IsString({ message: 'Senha atual deve ser uma string.' })
  senhaAtual?: string;

  @IsOptional()
  @IsString({ message: 'Nova senha deve ser uma string.' })
  @MinLength(8, { message: 'Nova senha deve ter ao menos 8 caracteres.' })
  novaSenha?: string;
}
