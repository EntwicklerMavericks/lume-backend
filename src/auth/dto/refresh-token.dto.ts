import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsNotEmpty({ message: 'Refresh token é obrigatório' })
  @IsString()
  refreshToken: string;
}
