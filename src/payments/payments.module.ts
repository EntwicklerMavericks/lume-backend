import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AsaasService } from './asaas.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, AsaasService],
  exports: [PaymentsService, AsaasService],
})
export class PaymentsModule {}
