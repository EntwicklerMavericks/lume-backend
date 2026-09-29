import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CalculateShippingDto {
  @IsNotEmpty({ message: 'CEP de destino é obrigatório' })
  @IsString()
  destinationCep: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  subtotal?: number;

  @IsOptional()
  @IsString()
  destinationCity?: string;

  @IsOptional()
  @IsString()
  destinationState?: string;
}
