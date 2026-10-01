import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Request,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CartItemDto, SyncCartDto } from './dto/sync-cart.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() req: any) {
    return this.cartService.getCart(req.user.sub);
  }

  @Post('sync')
  syncCart(@Request() req: any, @Body() dto: SyncCartDto) {
    return this.cartService.syncCart(req.user.sub, dto);
  }

  @Post('item')
  addItem(@Request() req: any, @Body() dto: CartItemDto) {
    return this.cartService.addItem(req.user.sub, dto);
  }

  @Put('item')
  updateItem(@Request() req: any, @Body() dto: CartItemDto) {
    return this.cartService.updateItemQuantity(req.user.sub, dto);
  }

  @Delete('item')
  removeItem(
    @Request() req: any,
    @Query('productId') productId: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
  ) {
    return this.cartService.removeItem(req.user.sub, productId, size, color);
  }

  @Delete()
  clearCart(@Request() req: any) {
    return this.cartService.clearCart(req.user.sub);
  }
}
