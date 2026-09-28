import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CheckoutDto } from './dto/checkout.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Finalizar compra transparente (PIX ou Cartão de Crédito)
   */
  @Public()
  @Post('checkout')
  async checkout(@Body() dto: CheckoutDto, @Ip() clientIp: string) {
    return this.paymentsService.processCheckout(dto, clientIp);
  }

  /**
   * Consultar status do pagamento do pedido (Polling em tempo real para PIX)
   */
  @Public()
  @Get('order/:id/status')
  async getStatus(@Param('id') id: string) {
    return this.paymentsService.checkOrderStatus(id);
  }

  /**
   * Endpoint facilitador de testes para aprovar um pagamento em ambiente de testes/sandbox
   */
  @Public()
  @Post('simulate-payment/:id')
  async simulatePayment(@Param('id') id: string) {
    return this.paymentsService.simulatePaymentApproval(id);
  }

  /**
   * Webhook oficial para receber notificações assíncronas do Asaas
   */
  @Public()
  @Post('webhook/asaas')
  async asaasWebhook(
    @Body() payload: any,
    @Headers('asaas-access-token') webhookToken?: string,
  ) {
    return this.paymentsService.handleAsaasWebhook(payload, webhookToken);
  }
}
