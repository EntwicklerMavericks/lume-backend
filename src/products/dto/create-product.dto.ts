import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageDto {
  @IsNotEmpty({ message: 'URL da imagem é obrigatória' })
  @IsString({ message: 'URL deve ser um texto' })
  url: string;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @IsOptional()
  @IsNumber()
  order?: number;
}

export class CreateProductDto {
  @IsNotEmpty({ message: 'Nome do produto é obrigatório' })
  @IsString({ message: 'Nome deve ser um texto' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Slug deve ser um texto' })
  slug?: string;

  @IsNotEmpty({ message: 'SKU é obrigatório' })
  @IsString({ message: 'SKU deve ser um texto' })
  sku: string;

  @IsOptional()
  @IsString({ message: 'Descrição deve ser um texto' })
  description?: string;

  @IsNotEmpty({ message: 'Preço é obrigatório' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Preço deve ser um número' })
  @Min(0.01, { message: 'Preço deve ser maior que zero' })
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Preço promocional deve ser um número' })
  @Min(0, { message: 'Preço promocional deve ser positivo' })
  promotionalPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Preço promocional (promo) deve ser um número' })
  pricePromo?: number | null;

  @IsNotEmpty({ message: 'Estoque é obrigatório' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Estoque deve ser um número' })
  @Min(0, { message: 'Estoque não pode ser negativo' })
  stock: number;

  @IsOptional()
  @IsBoolean({ message: 'Status deve ser booleano' })
  status?: boolean;

  @IsOptional()
  @IsString({ message: 'Gênero deve ser um texto' })
  gender?: string;

  @IsOptional()
  @IsBoolean({ message: 'Destaque deve ser booleano' })
  highlight?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Novo lançamento deve ser booleano' })
  newLaunch?: boolean;

  @IsOptional()
  @IsString({ message: 'Composição deve ser um texto' })
  composition?: string;

  @IsOptional()
  @IsString({ message: 'Modelagem/Fit deve ser um texto' })
  fit?: string;

  @IsOptional()
  @IsString({ message: 'Cuidados de lavagem deve ser um texto' })
  washCare?: string;

  @IsNotEmpty({ message: 'Categoria é obrigatória' })
  @IsString({ message: 'ID da Categoria deve ser um texto' })
  categoryId: string;

  @IsOptional()
  @IsArray({ message: 'Tamanhos deve ser uma lista' })
  sizes?: string[];

  @IsOptional()
  @IsArray({ message: 'Cores deve ser uma lista' })
  colors?: any[];

  @IsOptional()
  @IsArray({ message: 'Imagens deve ser uma lista' })
  images?: any[];
}
