import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyResetCodeDto {
  @IsNotEmpty({ message: 'E-mail é obrigatório' })
  @IsEmail({}, { message: 'E-mail deve ser um endereço de e-mail válido' })
  email: string;

  @IsNotEmpty({ message: 'Código de verificação é obrigatório' })
  @IsString()
  code: string;
}
