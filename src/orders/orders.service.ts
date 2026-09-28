import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatusEnum } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

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

  async updateStatus(id: string, status: OrderStatusEnum) {
    const order = await this.findOne(id);

    return this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: status as any,
        ...(status === OrderStatusEnum.PAID ? { paymentStatus: 'CONFIRMED' } : {}),
      },
      include: {
        items: true,
      },
    });
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
