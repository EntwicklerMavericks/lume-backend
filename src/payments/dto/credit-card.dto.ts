import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreditCardDto {
  @IsNotEmpty({ message: 'Nome impresso no cartão é obrigatório' })
  @IsString()
  holderName: string;

  @IsNotEmpty({ message: 'Número do cartão é obrigatório' })
  @IsString()
  number: string;

  @IsNotEmpty({ message: 'Mês de validade é obrigatório' })
  @IsString()
  expiryMonth: string;

  @IsNotEmpty({ message: 'Ano de validade é obrigatório' })
  @IsString()
  expiryYear: string;

  @IsNotEmpty({ message: 'CVV é obrigatório' })
  @IsString()
  @MinLength(3)
  @MaxLength(4)
  cvv: string;
}

export class CreditCardHolderInfoDto {
  @IsNotEmpty({ message: 'Nome do titular é obrigatório' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'E-mail do titular é obrigatório' })
  @IsString()
  email: string;

  @IsNotEmpty({ message: 'CPF do titular é obrigatório' })
  @IsString()
  cpfCnpj: string;

  @IsNotEmpty({ message: 'CEP do titular é obrigatório' })
  @IsString()
  postalCode: string;

  @IsNotEmpty({ message: 'Número do endereço do titular é obrigatório' })
  @IsString()
  addressNumber: string;

  @IsOptional()
  @IsString()
  addressComplement?: string;

  @IsNotEmpty({ message: 'Telefone do titular é obrigatório' })
  @IsString()
  phone: string;
}
