import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum OrderStatusEnum {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PREPARING = 'PREPARING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export class UpdateOrderStatusDto {
  @IsNotEmpty({ message: 'Status é obrigatório' })
  @IsEnum(OrderStatusEnum, { message: 'Status do pedido inválido' })
  status: OrderStatusEnum;

  @IsOptional()
  @IsString()
  trackingCode?: string;
}
