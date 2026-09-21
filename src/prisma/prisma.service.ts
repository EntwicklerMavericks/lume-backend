import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    // Wait for connection to be established. 
    // If database is not yet running, it might fail, 
    // but this ensures connection is ready when database is available.
    try {
      await this.$connect();
    } catch (error) {
      console.warn('Prisma failed to connect to database during initialization:', error.message);
    }
  }
}
