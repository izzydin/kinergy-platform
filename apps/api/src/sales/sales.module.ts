import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import { PrismaSaleRepository } from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from './controllers/sales.controller';

@Module({
  controllers: [SalesController],
  providers: [
    {
      provide: SALE_REPOSITORY_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaSaleRepository(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [SALE_REPOSITORY_TOKEN],
})
export class SalesModule {}
