import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import { AuditModule } from '../platform/audit/audit.module';
import {
  PrismaSaleRepository,
  PrismaPaymentRepository,
  PrismaReceiptRepository,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
} from '@kinergy-platform/core';
import { SalesController, SALE_REPOSITORY_TOKEN } from './controllers/sales.controller';
import { PaymentsController, PAYMENT_REPOSITORY_TOKEN } from './controllers/payments.controller';
import { ReceiptsController, RECEIPT_REPOSITORY_TOKEN } from './controllers/receipts.controller';
import { SalesAuditEventPublisher } from './infrastructure/sales-audit-event-publisher';

@Module({
  imports: [AuditModule],
  controllers: [SalesController, PaymentsController, ReceiptsController],
  providers: [
    SalesAuditEventPublisher,
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
      provide: RECEIPT_REPOSITORY_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaReceiptRepository(prisma),
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
      useFactory: (repo: SaleRepositoryPort, auditPublisher: SalesAuditEventPublisher) =>
        new FinalizeSaleHandler(repo, undefined, auditPublisher),
      inject: [SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: RecordPaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) => new RecordPaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: GetPaymentByIdHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort) => new GetPaymentByIdHandler(paymentRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN],
    },
    {
      provide: GetPaymentsBySaleIdHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort, saleRepo: SaleRepositoryPort) =>
        new GetPaymentsBySaleIdHandler(paymentRepo, saleRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN],
    },
    {
      provide: CompletePaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) => new CompletePaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: SettlePaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) => new SettlePaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: FailPaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) => new FailPaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: CancelPaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) => new CancelPaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: IssueReceiptHandler,
      useFactory: (
        receiptRepo: ReceiptRepositoryPort,
        saleRepo: SaleRepositoryPort,
        paymentRepo: PaymentRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
      ) =>
        new IssueReceiptHandler(
          receiptRepo,
          saleRepo,
          paymentRepo,
          undefined,
          undefined,
          auditPublisher,
        ),
      inject: [
        RECEIPT_REPOSITORY_TOKEN,
        SALE_REPOSITORY_TOKEN,
        PAYMENT_REPOSITORY_TOKEN,
        SalesAuditEventPublisher,
      ],
    },
    {
      provide: GetReceiptHandler,
      useFactory: (receiptRepo: ReceiptRepositoryPort) => new GetReceiptHandler(receiptRepo),
      inject: [RECEIPT_REPOSITORY_TOKEN],
    },
    {
      provide: GetReceiptBySaleHandler,
      useFactory: (receiptRepo: ReceiptRepositoryPort, saleRepo: SaleRepositoryPort) =>
        new GetReceiptBySaleHandler(receiptRepo, saleRepo),
      inject: [RECEIPT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN],
    },
  ],
  exports: [
    SALE_REPOSITORY_TOKEN,
    PAYMENT_REPOSITORY_TOKEN,
    RECEIPT_REPOSITORY_TOKEN,
    SalesAuditEventPublisher,
    CreateSaleHandler,
    GetSaleByIdHandler,
    AddSaleItemHandler,
    FinalizeSaleHandler,
    RecordPaymentHandler,
    GetPaymentByIdHandler,
    GetPaymentsBySaleIdHandler,
    CompletePaymentHandler,
    SettlePaymentHandler,
    FailPaymentHandler,
    CancelPaymentHandler,
    IssueReceiptHandler,
    GetReceiptHandler,
    GetReceiptBySaleHandler,
  ],
})
export class SalesModule {}
