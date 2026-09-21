import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @IsString({ message: 'Nome deve ser um texto' })
  name: string;

  @IsNotEmpty({ message: 'E-mail é obrigatório' })
  @IsEmail({}, { message: 'E-mail deve ser um endereço de e-mail válido' })
  email: string;

  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @IsString()
  @MinLength(6, { message: 'Senha deve conter pelo menos 6 caracteres' })
  password: string;
}
