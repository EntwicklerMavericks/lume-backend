import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreditCardDto, CreditCardHolderInfoDto } from './credit-card.dto';

export class CheckoutItemDto {
  @IsNotEmpty({ message: 'ID do produto é obrigatório' })
  @IsString()
  productId: string;

  @IsNotEmpty({ message: 'Nome do produto é obrigatório' })
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsNotEmpty({ message: 'Preço é obrigatório' })
  @IsNumber({}, { message: 'Preço deve ser um número' })
  @IsPositive({ message: 'Preço deve ser maior que zero' })
  price: number;

  @IsNotEmpty({ message: 'Quantidade é obrigatória' })
  @IsInt({ message: 'Quantidade deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade mínima é 1' })
  quantity: number;
}

export class CheckoutAddressDto {
  @IsNotEmpty({ message: 'CEP é obrigatório' })
  @IsString()
  postalCode: string;

  @IsNotEmpty({ message: 'Logradouro/Rua é obrigatório' })
  @IsString()
  street: string;

  @IsNotEmpty({ message: 'Número é obrigatório' })
  @IsString()
  number: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsNotEmpty({ message: 'Bairro é obrigatório' })
  @IsString()
  neighborhood: string;

  @IsNotEmpty({ message: 'Cidade é obrigatória' })
  @IsString()
  city: string;

  @IsNotEmpty({ message: 'Estado/UF é obrigatório' })
  @IsString()
  state: string;
}

export class CheckoutDto {
  // Customer info
  @IsNotEmpty({ message: 'Nome completo é obrigatório' })
  @IsString()
  customerName: string;

  @IsNotEmpty({ message: 'E-mail é obrigatório' })
  @IsEmail({}, { message: 'E-mail inválido' })
  customerEmail: string;

  @IsNotEmpty({ message: 'CPF é obrigatório' })
  @IsString()
  customerCpf: string;

  @IsNotEmpty({ message: 'Telefone/WhatsApp é obrigatório' })
  @IsString()
  customerPhone: string;

  // Address
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  @IsNotEmpty({ message: 'Endereço de entrega é obrigatório' })
  address: CheckoutAddressDto;

  // Cart items
  @IsArray({ message: 'Itens do carrinho devem ser um array' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  // Payment method
  @IsNotEmpty({ message: 'Método de pagamento é obrigatório' })
  @IsIn(['PIX', 'CREDIT_CARD'], { message: 'Método deve ser PIX ou CREDIT_CARD' })
  paymentMethod: 'PIX' | 'CREDIT_CARD';

  // Credit card details (if paymentMethod === 'CREDIT_CARD')
  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardDto)
  creditCard?: CreditCardDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreditCardHolderInfoDto)
  creditCardHolder?: CreditCardHolderInfoDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @IsOptional()
  @IsString()
  customerNotes?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
