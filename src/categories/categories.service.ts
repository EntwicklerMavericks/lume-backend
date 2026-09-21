import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

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

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const slug = createCategoryDto.slug?.trim() || slugify(createCategoryDto.name);

    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Categoria com slug '${slug}' já existe.`);
    }

    return this.prisma.category.create({
      data: {
        name: createCategoryDto.name,
        slug,
        description: createCategoryDto.description,
        image: createCategoryDto.image,
      },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async findOne(idOrSlug: string) {
    let category = await this.prisma.category.findUnique({
      where: { id: idOrSlug },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      category = await this.prisma.category.findUnique({
        where: { slug: idOrSlug },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });
    }

    if (!category) {
      throw new NotFoundException(`Categoria '${idOrSlug}' não encontrada.`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);

    let slug = updateCategoryDto.slug?.trim();
    if (!slug && updateCategoryDto.name) {
      slug = slugify(updateCategoryDto.name);
    }

    if (slug) {
      const conflict = await this.prisma.category.findFirst({
        where: {
          slug,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(`Categoria com slug '${slug}' já existe.`);
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(updateCategoryDto.name && { name: updateCategoryDto.name }),
        ...(slug && { slug }),
        ...(updateCategoryDto.description !== undefined && { description: updateCategoryDto.description }),
        ...(updateCategoryDto.image !== undefined && { image: updateCategoryDto.image }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const productsCount = await this.prisma.product.count({
      where: { categoryId: id },
    });

    if (productsCount > 0) {
      throw new ConflictException(`Não é possível excluir a categoria pois existem ${productsCount} produto(s) vinculados.`);
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Categoria excluída com sucesso.' };
  }
}
