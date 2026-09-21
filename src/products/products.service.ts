import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeProduct(p: any) {
  if (!p) return null;
  const price = Number(p.price);
  const promotionalPrice = p.promotionalPrice !== null && p.promotionalPrice !== undefined
    ? Number(p.promotionalPrice)
    : null;

  return {
    ...p,
    price,
    promotionalPrice,
    pricePromo: promotionalPrice, // For admin backwards compatibility
    images: p.images
      ? p.images.map((img: any) => ({
          id: img.id,
          url: img.url,
          isMain: img.isMain,
          order: img.order,
        }))
      : [],
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const sku = createProductDto.sku.trim();
    const existingSku = await this.prisma.product.findUnique({
      where: { sku },
    });
    if (existingSku) {
      throw new ConflictException(`Produto com SKU '${sku}' já cadastrado.`);
    }

    let slug = createProductDto.slug?.trim() || slugify(createProductDto.name);
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const category = await this.prisma.category.findUnique({
      where: { id: createProductDto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Categoria '${createProductDto.categoryId}' não encontrada.`);
    }

    const promotionalPrice = createProductDto.promotionalPrice ?? createProductDto.pricePromo ?? null;

    // Normalize images array
    const rawImages = createProductDto.images || [];
    const imagesData = rawImages.map((img: any, index: number) => {
      if (typeof img === 'string') {
        return { url: img, isMain: index === 0, order: index };
      }
      return {
        url: img.url,
        isMain: img.isMain ?? index === 0,
        order: img.order ?? index,
      };
    });

    const created = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        slug,
        sku,
        description: createProductDto.description || '',
        price: createProductDto.price,
        promotionalPrice: promotionalPrice ? Number(promotionalPrice) : null,
        stock: createProductDto.stock ?? 0,
        status: createProductDto.status ?? true,
        gender: createProductDto.gender || 'Masculino',
        highlight: createProductDto.highlight ?? false,
        newLaunch: createProductDto.newLaunch ?? false,
        composition: createProductDto.composition,
        fit: createProductDto.fit,
        washCare: createProductDto.washCare,
        categoryId: createProductDto.categoryId,
        sizes: createProductDto.sizes ? JSON.parse(JSON.stringify(createProductDto.sizes)) : [],
        colors: createProductDto.colors ? JSON.parse(JSON.stringify(createProductDto.colors)) : [],
        images: {
          create: imagesData,
        },
      },
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return normalizeProduct(created);
  }

  async findAll(options?: {
    includeInactive?: boolean;
    categoryId?: string;
    gender?: string;
    highlight?: boolean;
    newLaunch?: boolean;
    search?: string;
  }) {
    const where: any = {};

    if (!options?.includeInactive) {
      where.status = true;
    }

    if (options?.categoryId) {
      where.categoryId = options.categoryId;
    }

    if (options?.gender) {
      where.gender = options.gender;
    }

    if (options?.highlight !== undefined) {
      where.highlight = options.highlight;
    }

    if (options?.newLaunch !== undefined) {
      where.newLaunch = options.newLaunch;
    }

    if (options?.search) {
      const term = options.search.trim();
      where.OR = [
        { name: { contains: term } },
        { description: { contains: term } },
        { sku: { contains: term } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return products.map(normalizeProduct);
  }

  async findOne(id: string, isAdmin = false) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!product || (!product.status && !isAdmin)) {
      throw new NotFoundException(`Produto '${id}' não encontrado.`);
    }

    return normalizeProduct(product);
  }

  async findBySlug(slug: string, isAdmin = false) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!product || (!product.status && !isAdmin)) {
      throw new NotFoundException(`Produto com slug '${slug}' não encontrado.`);
    }

    return normalizeProduct(product);
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!existing) {
      throw new NotFoundException(`Produto '${id}' não encontrado.`);
    }

    if (updateProductDto.sku && updateProductDto.sku !== existing.sku) {
      const conflict = await this.prisma.product.findUnique({
        where: { sku: updateProductDto.sku },
      });
      if (conflict) {
        throw new ConflictException(`Produto com SKU '${updateProductDto.sku}' já cadastrado.`);
      }
    }

    let slug = updateProductDto.slug?.trim();
    if (!slug && updateProductDto.name && updateProductDto.name !== existing.name) {
      slug = slugify(updateProductDto.name);
    }
    if (slug && slug !== existing.slug) {
      const conflict = await this.prisma.product.findUnique({
        where: { slug },
      });
      if (conflict) {
        slug = `${slug}-${Date.now().toString().slice(-4)}`;
      }
    }

    if (updateProductDto.categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: updateProductDto.categoryId },
      });
      if (!cat) {
        throw new NotFoundException(`Categoria '${updateProductDto.categoryId}' não encontrada.`);
      }
    }

    const promotionalPrice = updateProductDto.promotionalPrice !== undefined
      ? updateProductDto.promotionalPrice
      : updateProductDto.pricePromo !== undefined
      ? updateProductDto.pricePromo
      : undefined;

    // If images array is explicitly provided, update images
    if (updateProductDto.images) {
      await this.prisma.productImage.deleteMany({
        where: { productId: id },
      });

      const newImagesData = updateProductDto.images.map((img: any, index: number) => {
        if (typeof img === 'string') {
          return { productId: id, url: img, isMain: index === 0, order: index };
        }
        return {
          productId: id,
          url: img.url,
          isMain: img.isMain ?? index === 0,
          order: img.order ?? index,
        };
      });

      if (newImagesData.length > 0) {
        await this.prisma.productImage.createMany({
          data: newImagesData,
        });
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(updateProductDto.name && { name: updateProductDto.name }),
        ...(slug && { slug }),
        ...(updateProductDto.sku && { sku: updateProductDto.sku }),
        ...(updateProductDto.description !== undefined && { description: updateProductDto.description }),
        ...(updateProductDto.price !== undefined && { price: updateProductDto.price }),
        ...(promotionalPrice !== undefined && { promotionalPrice: promotionalPrice ? Number(promotionalPrice) : null }),
        ...(updateProductDto.stock !== undefined && { stock: updateProductDto.stock }),
        ...(updateProductDto.status !== undefined && { status: updateProductDto.status }),
        ...(updateProductDto.gender && { gender: updateProductDto.gender }),
        ...(updateProductDto.highlight !== undefined && { highlight: updateProductDto.highlight }),
        ...(updateProductDto.newLaunch !== undefined && { newLaunch: updateProductDto.newLaunch }),
        ...(updateProductDto.composition !== undefined && { composition: updateProductDto.composition }),
        ...(updateProductDto.fit !== undefined && { fit: updateProductDto.fit }),
        ...(updateProductDto.washCare !== undefined && { washCare: updateProductDto.washCare }),
        ...(updateProductDto.categoryId && { categoryId: updateProductDto.categoryId }),
        ...(updateProductDto.sizes !== undefined && { sizes: JSON.parse(JSON.stringify(updateProductDto.sizes)) }),
        ...(updateProductDto.colors !== undefined && { colors: JSON.parse(JSON.stringify(updateProductDto.colors)) }),
      },
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return normalizeProduct(updated);
  }

  async toggleStatus(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Produto '${id}' não encontrado.`);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        status: !existing.status,
      },
      include: {
        category: true,
        images: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return normalizeProduct(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Produto '${id}' não encontrado.`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: 'Produto excluído com sucesso.' };
  }
}
