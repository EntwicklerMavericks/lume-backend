import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Public } from '../common/decorators/public.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly jwtService: JwtService,
  ) {}

  private checkIsAdmin(req: Request): boolean {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return false;
    }
    try {
      const token = authHeader.split(' ')[1];
      const payload: any = this.jwtService.verify(token);
      return payload?.role === 'ADMIN';
    } catch {
      return false;
    }
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Public()
  @Get()
  async findAll(
    @Req() req: Request,
    @Query('all') all?: string,
    @Query('categoryId') categoryId?: string,
    @Query('gender') gender?: string,
    @Query('highlight') highlight?: string,
    @Query('newLaunch') newLaunch?: string,
    @Query('search') search?: string,
  ) {
    let includeInactive = false;

    // ?all=true requires valid JWT token with ADMIN role
    if (all === 'true') {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Acesso negado: visualização de produtos inativos requer autenticação de administrador.');
      }

      const token = authHeader.split(' ')[1];
      try {
        const payload: any = this.jwtService.verify(token);
        if (payload.role !== 'ADMIN') {
          throw new ForbiddenException('Acesso negado: operação restrita a administradores.');
        }
        includeInactive = true;
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        throw new UnauthorizedException('Token de administrador inválido ou expirado.');
      }
    }

    return this.productsService.findAll({
      includeInactive,
      categoryId,
      gender,
      highlight: highlight !== undefined ? highlight === 'true' : undefined,
      newLaunch: newLaunch !== undefined ? newLaunch === 'true' : undefined,
      search,
    });
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Req() req: Request, @Param('slug') slug: string) {
    const isAdmin = this.checkIsAdmin(req);
    return this.productsService.findBySlug(slug, isAdmin);
  }

  @Public()
  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    const isAdmin = this.checkIsAdmin(req);
    return this.productsService.findOne(id, isAdmin);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.productsService.toggleStatus(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
