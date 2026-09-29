import { Controller, Get, Put, Post, Body, Param } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Public()
  @Put()
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Public()
  @Post('shipping/calculate')
  calculateShipping(@Body() dto: CalculateShippingDto) {
    return this.settingsService.calculateShipping(dto);
  }
}

@Controller('shipping')
export class ShippingController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @Post('calculate')
  calculateShipping(@Body() dto: CalculateShippingDto) {
    return this.settingsService.calculateShipping(dto);
  }

  @Public()
  @Get('cep/:cep')
  lookupCep(@Param('cep') cep: string) {
    return this.settingsService.lookupCep(cep);
  }
}
