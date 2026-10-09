import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import { AuditModule } from '../platform/audit/audit.module';
import {
  PrismaSaleRepository,
  PrismaPaymentRepository,
  PrismaReceiptRepository,
  PrismaSalesUnitOfWork,
  CreateSaleHandler,
  AssignSaleSourceHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CoordinateSalePaymentHandler,
  CalculateSaleHandler,
  ListSalesHandler,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  ListPaymentsHandler,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  ReceiptRepositoryPort,
} from '@kinergy-platform/core';
import { SalesController } from './controllers/sales.controller';
import { PaymentsController } from './controllers/payments.controller';
import { ReceiptsController } from './controllers/receipts.controller';
import {
  SALE_REPOSITORY_TOKEN,
  PAYMENT_REPOSITORY_TOKEN,
  RECEIPT_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from './sales.tokens';
import { SalesAuditEventPublisher } from './infrastructure/sales-audit-event-publisher';

@Module({
  imports: [AuditModule],
  controllers: [SalesController, PaymentsController, ReceiptsController],
  providers: [
    SalesAuditEventPublisher,
    {
      provide: UNIT_OF_WORK_TOKEN,
      useFactory: (prisma: PrismaService) => new PrismaSalesUnitOfWork(prisma),
      inject: [PrismaService],
    },
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
      provide: AssignSaleSourceHandler,
      useFactory: (repo: SaleRepositoryPort) => new AssignSaleSourceHandler(repo),
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
      provide: RemoveSaleItemHandler,
      useFactory: (repo: SaleRepositoryPort) => new RemoveSaleItemHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: ApplyOrderDiscountHandler,
      useFactory: (repo: SaleRepositoryPort) => new ApplyOrderDiscountHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: RemoveOrderDiscountHandler,
      useFactory: (repo: SaleRepositoryPort) => new RemoveOrderDiscountHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: FinalizeSaleHandler,
      useFactory: (repo: SaleRepositoryPort, auditPublisher: SalesAuditEventPublisher) =>
        new FinalizeSaleHandler(repo, undefined, auditPublisher),
      inject: [SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: CancelSaleHandler,
      useFactory: (repo: SaleRepositoryPort, auditPublisher: SalesAuditEventPublisher) =>
        new CancelSaleHandler(repo, undefined, auditPublisher),
      inject: [SALE_REPOSITORY_TOKEN, SalesAuditEventPublisher],
    },
    {
      provide: CalculateSaleHandler,
      useFactory: (repo: SaleRepositoryPort) => new CalculateSaleHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: ListSalesHandler,
      useFactory: (repo: SaleRepositoryPort) => new ListSalesHandler(repo),
      inject: [SALE_REPOSITORY_TOKEN],
    },
    {
      provide: CoordinateSalePaymentHandler,
      useFactory: (saleRepo: SaleRepositoryPort, paymentRepo: PaymentRepositoryPort) =>
        new CoordinateSalePaymentHandler(saleRepo, paymentRepo),
      inject: [SALE_REPOSITORY_TOKEN, PAYMENT_REPOSITORY_TOKEN],
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
      provide: GetSalePaymentHistoryHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort, saleRepo: SaleRepositoryPort) =>
        new GetSalePaymentHistoryHandler(paymentRepo, saleRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN, SALE_REPOSITORY_TOKEN],
    },
    {
      provide: CompletePaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
        unitOfWork: PrismaSalesUnitOfWork,
      ) => new CompletePaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher, unitOfWork),
      inject: [
        PAYMENT_REPOSITORY_TOKEN,
        SALE_REPOSITORY_TOKEN,
        SalesAuditEventPublisher,
        UNIT_OF_WORK_TOKEN,
      ],
    },
    {
      provide: SettlePaymentHandler,
      useFactory: (
        paymentRepo: PaymentRepositoryPort,
        saleRepo: SaleRepositoryPort,
        auditPublisher: SalesAuditEventPublisher,
        unitOfWork: PrismaSalesUnitOfWork,
      ) => new SettlePaymentHandler(paymentRepo, saleRepo, undefined, auditPublisher, unitOfWork),
      inject: [
        PAYMENT_REPOSITORY_TOKEN,
        SALE_REPOSITORY_TOKEN,
        SalesAuditEventPublisher,
        UNIT_OF_WORK_TOKEN,
      ],
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
      provide: ListPaymentsHandler,
      useFactory: (paymentRepo: PaymentRepositoryPort) => new ListPaymentsHandler(paymentRepo),
      inject: [PAYMENT_REPOSITORY_TOKEN],
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
    UNIT_OF_WORK_TOKEN,
    SALE_REPOSITORY_TOKEN,
    PAYMENT_REPOSITORY_TOKEN,
    RECEIPT_REPOSITORY_TOKEN,
    SalesAuditEventPublisher,
    CreateSaleHandler,
    AssignSaleSourceHandler,
    GetSaleByIdHandler,
    AddSaleItemHandler,
    RemoveSaleItemHandler,
    ApplyOrderDiscountHandler,
    RemoveOrderDiscountHandler,
    FinalizeSaleHandler,
    CancelSaleHandler,
    CalculateSaleHandler,
    ListSalesHandler,
    CoordinateSalePaymentHandler,
    RecordPaymentHandler,
    GetPaymentByIdHandler,
    GetPaymentsBySaleIdHandler,
    GetSalePaymentHistoryHandler,
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
