import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CartItemDto, SyncCartDto } from './dto/sync-cart.dto';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtém ou cria o carrinho do usuário autenticado
   */
  async getCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: {
                  where: { isMain: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: {
                    where: { isMain: true },
                    take: 1,
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });
    }

    return cart;
  }

  /**
   * Sincroniza o carrinho local do cliente (guest) com o banco de dados
   */
  async syncCart(userId: string, dto: SyncCartDto) {
    const cart = await this.getCart(userId);

    for (const item of dto.items) {
      const existing = await this.prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: item.productId,
          size: item.size || null,
          color: item.color || null,
        },
      });

      if (existing) {
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.max(existing.quantity, item.quantity) },
        });
      } else {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });
        if (product) {
          await this.prisma.cartItem.create({
            data: {
              cartId: cart.id,
              productId: item.productId,
              size: item.size || null,
              color: item.color || null,
              quantity: item.quantity,
            },
          });
        }
      }
    }

    return this.getCart(userId);
  }

  /**
   * Adiciona item ao carrinho do usuário
   */
  async addItem(userId: string, dto: CartItemDto) {
    const cart = await this.getCart(userId);

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: dto.productId,
        size: dto.size || null,
        color: dto.color || null,
      },
    });

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + dto.quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          size: dto.size || null,
          color: dto.color || null,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  /**
   * Atualiza a quantidade de um item
   */
  async updateItemQuantity(userId: string, dto: CartItemDto) {
    const cart = await this.getCart(userId);

    const existing = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: dto.productId,
        size: dto.size || null,
        color: dto.color || null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Item não encontrado no carrinho.');
    }

    if (dto.quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: dto.quantity },
      });
    }

    return this.getCart(userId);
  }

  /**
   * Remove item do carrinho
   */
  async removeItem(userId: string, productId: string, size?: string, color?: string) {
    const cart = await this.getCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        productId,
        size: size || null,
        color: color || null,
      },
    });

    return this.getCart(userId);
  }

  /**
   * Limpa o carrinho do usuário
   */
  async clearCart(userId: string) {
    const cart = await this.getCart(userId);
    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });
    return { success: true };
  }
}
