import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Nome deve ser um texto' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail deve ser um endereço de e-mail válido' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve conter pelo menos 6 caracteres' })
  password?: string;
}
