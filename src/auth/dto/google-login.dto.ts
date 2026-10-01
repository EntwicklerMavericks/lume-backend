import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString({ message: 'O token do Google deve ser uma string válida.' })
  @IsNotEmpty({ message: 'O token do Google é obrigatório.' })
  credential: string;
}
