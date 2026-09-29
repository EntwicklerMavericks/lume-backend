import { IsEmail, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pacBaseRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sedexBaseRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freeShippingMin?: number;
}
