import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private asaasService: AsaasService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  /**
   * Processa o checkout completo e transparente (PIX ou Cartão)
   */
  async processCheckout(dto: CheckoutDto, clientIp?: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A sacola de compras está vazia.');
    }

    // 1. Calcular subtotal e total
    const subtotal = dto.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const shippingCost = dto.shippingCost !== undefined ? Math.max(0, Number(dto.shippingCost)) : 0;
    const total = Math.round((subtotal + shippingCost) * 100) / 100;

    // 2. Gerar número legível do pedido (Ex: LUM-839201)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `LUM-${Date.now().toString().slice(-4)}${randomSuffix}`;

    // 3. Cadastrar ou localizar cliente no Asaas
    const asaasCustomerId = await this.asaasService.findOrCreateCustomer({
      name: dto.customerName,
      email: dto.customerEmail,
      cpfCnpj: dto.customerCpf,
      phone: dto.customerPhone,
      postalCode: dto.address.postalCode,
      address: dto.address.street,
      addressNumber: dto.address.number,
      complement: dto.address.complement,
      neighborhood: dto.address.neighborhood,
      city: dto.address.city,
      state: dto.address.state,
    });

    // 4. Tratar método de pagamento
    if (dto.paymentMethod === 'PIX') {
      // Cria a cobrança PIX no Asaas
      const pixResult = await this.asaasService.createPixPayment({
        orderId: orderNumber,
        orderNumber,
        total,
        customerId: asaasCustomerId,
        customerNotes: dto.customerNotes,
      });

      // Salva o pedido no banco de dados com os dados do PIX
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerCpf: dto.customerCpf.replace(/\D/g, ''),
          customerPhone: dto.customerPhone.replace(/\D/g, ''),
          postalCode: dto.address.postalCode.replace(/\D/g, ''),
          street: dto.address.street,
          number: dto.address.number,
          complement: dto.address.complement,
          neighborhood: dto.address.neighborhood,
          city: dto.address.city,
          state: dto.address.state,
          subtotal,
          shippingCost,
          shippingMethod: dto.shippingMethod || (shippingCost > 0 ? 'Correios' : 'Frete Grátis'),
          total,
          paymentMethod: 'PIX',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          asaasCustomerId,
          asaasPaymentId: pixResult.paymentId,
          pixQrCodeImage: pixResult.qrCodeImage,
          pixCopiaECola: pixResult.copiaECola,
          pixExpiresAt: pixResult.expiresAt,
          customerNotes: dto.customerNotes,
          userId: dto.userId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              image: item.image,
              size: item.size,
              color: item.color,
              price: item.price,
              quantity: item.quantity,
              total: item.price * item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Dispara e-mail de confirmação de pedido com instruções do PIX em segundo plano
      this.mailService.sendOrderCreated(order).catch((err) => {
        this.logger.error(`[MailService] Falha ao enviar e-mail do pedido #${order.orderNumber}:`, err);
      });

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: 'PIX',
        status: order.status,
        total: order.total,
        pix: {
          qrCodeImage: order.pixQrCodeImage,
          copiaECola: order.pixCopiaECola,
          expiresAt: order.pixExpiresAt,
        },
        items: order.items,
        isSimulator: !this.asaasService.getIsLive(),
      };
    } else if (dto.paymentMethod === 'CREDIT_CARD') {
      if (!dto.creditCard) {
        throw new BadRequestException('Dados do cartão de crédito não fornecidos.');
      }

      const cardHolder = dto.creditCardHolder || {
        name: dto.creditCard.holderName,
        email: dto.customerEmail,
        cpfCnpj: dto.customerCpf,
        postalCode: dto.address.postalCode,
        addressNumber: dto.address.number,
        addressComplement: dto.address.complement,
        phone: dto.customerPhone,
      };

      // Processa o pagamento transparente no Asaas
      const cardResult = await this.asaasService.createCreditCardPayment({
        orderId: orderNumber,
        orderNumber,
        total,
        customerId: asaasCustomerId,
        installments: dto.installments || 1,
        card: dto.creditCard,
        cardHolder,
        remoteIp: clientIp,
      });

      if (!cardResult.confirmed && cardResult.status === 'REFUNDED') {
        throw new BadRequestException(cardResult.message || 'Cartão recusado pela operadora.');
      }

      const isApproved = cardResult.confirmed || cardResult.status === 'CONFIRMED' || cardResult.status === 'RECEIVED';

      // Salva o pedido no banco de dados
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerCpf: dto.customerCpf.replace(/\D/g, ''),
          customerPhone: dto.customerPhone.replace(/\D/g, ''),
          postalCode: dto.address.postalCode.replace(/\D/g, ''),
          street: dto.address.street,
          number: dto.address.number,
          complement: dto.address.complement,
          neighborhood: dto.address.neighborhood,
          city: dto.address.city,
          state: dto.address.state,
          subtotal,
          shippingCost,
          shippingMethod: dto.shippingMethod || (shippingCost > 0 ? 'Correios' : 'Frete Grátis'),
          total,
          paymentMethod: 'CREDIT_CARD',
          status: isApproved ? 'PAID' : 'PENDING_PAYMENT',
          paymentStatus: isApproved ? 'CONFIRMED' : 'PENDING',
          asaasCustomerId,
          asaasPaymentId: cardResult.paymentId,
          installments: dto.installments || 1,
          customerNotes: dto.customerNotes,
          userId: dto.userId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              name: item.name,
              sku: item.sku,
              image: item.image,
              size: item.size,
              color: item.color,
              price: item.price,
              quantity: item.quantity,
              total: item.price * item.quantity,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // Dispara e-mail de pedido criado
      this.mailService.sendOrderCreated(order).catch((err) => {
        this.logger.error(`[MailService] Falha ao enviar e-mail do pedido #${order.orderNumber}:`, err);
      });

      // Se o cartão foi aprovado imediatamente, dispara e-mail de pagamento confirmado
      if (order.status === 'PAID') {
        this.mailService.sendPaymentConfirmed(order).catch((err) => {
          this.logger.error(`[MailService] Falha ao enviar e-mail de pagamento confirmado #${order.orderNumber}:`, err);
        });
      }

      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: 'CREDIT_CARD',
        status: order.status,
        total: order.total,
        installments: order.installments,
        message: cardResult.message || 'Pagamento com cartão processado com sucesso!',
        items: order.items,
        isSimulator: !this.asaasService.getIsLive(),
      };
    }

    throw new BadRequestException('Método de pagamento inválido.');
  }

  /**
   * Consulta status de pagamento em tempo real (para polling do PIX no frontend)
   */
  async checkOrderStatus(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    // Se já está pago ou em etapas posteriores, retorna imediatamente
    if (['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        isPaid: true,
        trackingCode: order.trackingCode,
        shippedAt: order.shippedAt,
        deliveredAt: order.deliveredAt,
        total: order.total,
        paymentMethod: order.paymentMethod,
        items: order.items,
      };
    }

    // Se estiver pendente e possuir ID Asaas, checa status no Asaas
    if (order.asaasPaymentId && this.asaasService.getIsLive()) {
      const asaasStatus = await this.asaasService.getPaymentStatus(order.asaasPaymentId);
      if (asaasStatus === 'CONFIRMED' || asaasStatus === 'RECEIVED') {
        const updated = await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'PAID',
            paymentStatus: 'CONFIRMED',
          },
          include: { items: true },
        });

        // Notifica cliente por e-mail que o pagamento foi confirmado
        this.mailService.sendPaymentConfirmed(updated).catch((err) => {
          this.logger.error(`[MailService] Falha ao enviar e-mail de pagamento confirmado #${updated.orderNumber}:`, err);
        });

        return {
          orderId: updated.id,
          orderNumber: updated.orderNumber,
          status: updated.status,
          isPaid: true,
          trackingCode: updated.trackingCode,
          shippedAt: updated.shippedAt,
          deliveredAt: updated.deliveredAt,
          total: updated.total,
          paymentMethod: updated.paymentMethod,
          items: updated.items,
        };
      }
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      isPaid: false,
      trackingCode: order.trackingCode,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      total: order.total,
      paymentMethod: order.paymentMethod,
      pix: order.paymentMethod === 'PIX' ? {
        qrCodeImage: order.pixQrCodeImage,
        copiaECola: order.pixCopiaECola,
        expiresAt: order.pixExpiresAt,
      } : null,
      items: order.items,
    };
  }

  /**
   * Simula a confirmação imediata de um pagamento (Modo Teste / Sandbox)
   */
  async simulatePaymentApproval(orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id: orderId }, { orderNumber: orderId }],
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paymentStatus: 'CONFIRMED',
      },
      include: {
        items: true,
      },
    });

    this.logger.log(`[Simulador] Pagamento do pedido #${updated.orderNumber} aprovado com sucesso para testes.`);

    // Dispara e-mail de pagamento confirmado
    this.mailService.sendPaymentConfirmed(updated).catch((err) => {
      this.logger.error(`[MailService] Falha ao enviar e-mail de confirmação de pagamento simulado #${updated.orderNumber}:`, err);
    });

    return {
      success: true,
      message: 'Pagamento simulado com sucesso!',
      order: updated,
    };
  }

  /**
   * Webhook do Asaas para recebimento automático de notificações
   */
  async handleAsaasWebhook(payload: any, token?: string) {
    const configuredToken = this.configService.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (configuredToken && token && token !== configuredToken) {
      this.logger.warn(`[Webhook Asaas] Token de webhook inválido: ${token}`);
      throw new BadRequestException('Token de autenticação do webhook inválido');
    }

    this.logger.log(`[Webhook Asaas] Evento recebido: ${payload?.event}`);

    const event = payload?.event;
    const payment = payload?.payment;

    if (!payment || !payment.id) {
      return { received: true, ignored: true };
    }

    // Localizar pedido correspondente pelo asaasPaymentId ou externalReference
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { asaasPaymentId: payment.id },
          ...(payment.externalReference ? [{ id: payment.externalReference }, { orderNumber: payment.externalReference }] : []),
        ],
      },
    });

    if (!order) {
      this.logger.warn(`[Webhook Asaas] Pedido não encontrado para pagamento ${payment.id}`);
      return { received: true, notFound: true };
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const updated = await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'PAID',
          paymentStatus: 'CONFIRMED',
        },
        include: { items: true },
      });
      this.logger.log(`[Webhook Asaas] Pedido #${order.orderNumber} atualizado para PAGO`);

      // Dispara e-mail de pagamento confirmado via Webhook
      this.mailService.sendPaymentConfirmed(updated).catch((err) => {
        this.logger.error(`[MailService] Falha ao enviar e-mail de pagamento confirmado #${updated.orderNumber}:`, err);
      });
    } else if (event === 'PAYMENT_OVERDUE') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'OVERDUE',
        },
      });
    } else if (event === 'PAYMENT_REFUNDED') {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          paymentStatus: 'REFUNDED',
        },
      });
    }

    return { received: true, orderNumber: order.orderNumber, status: event };
  }
}
