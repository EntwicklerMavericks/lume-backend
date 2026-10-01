import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Listar pedidos do cliente logado (Customer ou Admin)
   */
  @Get('my-orders')
  async findMyOrders(@Request() req: any) {
    return this.ordersService.findByUserId(req.user.sub);
  }

  /**
   * Listar pedidos (Admin)
   */
  @Roles('ADMIN')
  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.ordersService.findAll({ status, search, limit, offset });
  }

  /**
   * Estatísticas de pedidos para dashboard (Admin)
   */
  @Roles('ADMIN')
  @Get('stats')
  async getStats() {
    return this.ordersService.getStats();
  }

  /**
   * Detalhes de um pedido (Público para acompanhamento pelo cliente ou Admin)
   */
  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  /**
   * Atualizar status do pedido (Admin)
   */
  @Roles('ADMIN')
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status, dto.trackingCode);
  }
}
