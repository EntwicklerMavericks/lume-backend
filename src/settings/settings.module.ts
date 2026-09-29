import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController, ShippingController } from './settings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController, ShippingController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
