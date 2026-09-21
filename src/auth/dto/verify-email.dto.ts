import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsNotEmpty({ message: 'Token de verificação é obrigatório' })
  @IsString()
  token: string;
}
