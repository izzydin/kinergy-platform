import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaSaleRepository,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  SaleRepositoryInterface,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from './controllers/sales.controller';

@Module({
  controllers: [SalesController],
  providers: [
    {
      provide: SALE_REPOSITORY_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaSaleRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CreateSaleHandler,
      useFactory: (repo: SaleRepositoryInterface) => new CreateSaleHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: GetSaleByIdHandler,
      useFactory: (repo: SaleRepositoryInterface) => new GetSaleByIdHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: AddSaleItemHandler,
      useFactory: (repo: SaleRepositoryInterface) => new AddSaleItemHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: FinalizeSaleHandler,
      useFactory: (repo: SaleRepositoryInterface) => new FinalizeSaleHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
  ],
  exports: [
    SALE_REPOSITORY_TOKEN,
    CreateSaleHandler,
    GetSaleByIdHandler,
    AddSaleItemHandler,
    FinalizeSaleHandler,
  ],
})
export class SalesModule {}
