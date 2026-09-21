import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaSaleRepository,
  PrismaPaymentRepository,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  SettlePaymentHandler,
  CancelPaymentHandler,
  SaleRepositoryPort,
  PaymentRepositoryPort,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from './controllers/sales.controller';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from './controllers/payments.controller';

@Module({
  controllers: [SalesController, PaymentsController],
  providers: [
    {
      provide: SALE_REPOSITORY_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaSaleRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PAYMENT_REPOSITORY_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaPaymentRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CreateSaleHandler,
      useFactory: (repo: SaleRepositoryPort) => new CreateSaleHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: GetSaleByIdHandler,
      useFactory: (repo: SaleRepositoryPort) => new GetSaleByIdHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: AddSaleItemHandler,
      useFactory: (repo: SaleRepositoryPort) => new AddSaleItemHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: FinalizeSaleHandler,
      useFactory: (repo: SaleRepositoryPort) => new FinalizeSaleHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: RecordPaymentHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort, saleRepo: SaleRepositoryPort) =>
        new RecordPaymentHandler(paymentRepo, saleRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN],
    },
    {
      provide: GetPaymentByIdHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort) => new GetPaymentByIdHandler(paymentRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN],
    },
    {
      provide: GetPaymentsBySaleIdHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort) =>
        new GetPaymentsBySaleIdHandler(paymentRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN],
    },
    {
      provide: SettlePaymentHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort, saleRepo: SaleRepositoryPort) =>
        new SettlePaymentHandler(paymentRepo, saleRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN],
    },
    {
      provide: CancelPaymentHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort) => new CancelPaymentHandler(paymentRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN],
    },
  ],
  exports: [
    SALE_REPOSITORY_TOKEN,
    PAYMENT_REPOSITORY_TOKEN,
    CreateSaleHandler,
    GetSaleByIdHandler,
    AddSaleItemHandler,
    FinalizeSaleHandler,
    RecordPaymentHandler,
    GetPaymentByIdHandler,
    GetPaymentsBySaleIdHandler,
    SettlePaymentHandler,
    CancelPaymentHandler,
  ],
})
export class SalesModule {}
