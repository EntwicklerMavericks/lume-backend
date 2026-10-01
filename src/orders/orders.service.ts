import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatusEnum } from './dto/update-order-status.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async findAll(options?: { status?: string; search?: string; limit?: number; offset?: number }) {
    const where: any = {};

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.search) {
      where.OR = [
        { orderNumber: { contains: options.search } },
        { customerName: { contains: options.search } },
        { customerEmail: { contains: options.search } },
        { customerCpf: { contains: options.search } },
      ];
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
    ]);

    return {
      total,
      orders,
    };
  }

  async findByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    const where: any = {
      OR: [
        { userId },
        ...(user?.email ? [{ customerEmail: user.email }] : []),
      ],
    };

    return this.prisma.order.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        items: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Pedido ${id} não encontrado`);
    }

    return order;
  }

  async updateStatus(id: string, status: OrderStatusEnum, trackingCode?: string) {
    const order = await this.findOne(id);

    const updateData: any = {
      status: status as any,
      ...(status === OrderStatusEnum.PAID ? { paymentStatus: 'CONFIRMED' } : {}),
      ...(status === OrderStatusEnum.SHIPPED ? { shippedAt: new Date() } : {}),
      ...(status === OrderStatusEnum.DELIVERED ? { deliveredAt: new Date() } : {}),
    };

    if (trackingCode !== undefined) {
      updateData.trackingCode = trackingCode ? trackingCode.trim() : null;
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
      include: {
        items: true,
      },
    });

    // Se o pedido foi despachado ou código de rastreamento adicionado, dispara e-mail de rastreio
    if (status === OrderStatusEnum.SHIPPED || (trackingCode && trackingCode !== order.trackingCode)) {
      this.mailService.sendOrderShipped(updated).catch((err) => {
        console.error(`[MailService] Falha ao enviar e-mail de pedido despachado #${updated.orderNumber}:`, err);
      });
    } else if (status === OrderStatusEnum.DELIVERED) {
      this.mailService.sendOrderDelivered(updated).catch((err) => {
        console.error(`[MailService] Falha ao enviar e-mail de pedido entregue #${updated.orderNumber}:`, err);
      });
    } else if (status === OrderStatusEnum.PAID && order.status !== 'PAID') {
      this.mailService.sendPaymentConfirmed(updated).catch((err) => {
        console.error(`[MailService] Falha ao enviar e-mail de pagamento confirmado #${updated.orderNumber}:`, err);
      });
    }

    return updated;
  }

  async getStats() {
    const [totalCount, paidOrders, pendingOrders, revenueResult] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'PAID' } }),
      this.prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
      this.prisma.order.aggregate({
        _sum: {
          total: true,
        },
        where: {
          status: 'PAID',
        },
      }),
    ]);

    return {
      totalOrders: totalCount,
      paidOrders,
      pendingOrders,
      totalRevenue: revenueResult._sum.total || 0,
    };
  }
}
