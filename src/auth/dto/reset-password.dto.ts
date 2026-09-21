import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'Token de redefinição é obrigatório' })
  @IsString()
  token: string;

  @IsNotEmpty({ message: 'Nova senha é obrigatória' })
  @IsString()
  @MinLength(6, { message: 'Senha deve conter pelo menos 6 caracteres' })
  password: string;
}
