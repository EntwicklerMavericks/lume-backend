import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
