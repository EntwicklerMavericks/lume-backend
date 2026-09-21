import { IsOptional, IsString } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString({ message: 'Nome deve ser um texto' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Slug deve ser um texto' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'Descrição deve ser um texto' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Imagem deve ser um texto ou URL' })
  image?: string;
}
