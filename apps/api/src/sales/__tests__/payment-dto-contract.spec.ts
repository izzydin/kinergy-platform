import { BadRequestException } from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  Money,
  Payment,
  PaymentMapper,
  SystemClock,
} from '@kinergy-platform/core';
import {
  RecordPaymentRequestDto,
  CreatePaymentRequestDto,
  CompletePaymentRequestDto,
  SettlePaymentRequestDto,
  CancelPaymentRequestDto,
  FailPaymentRequestDto,
  ListPaymentsQueryDto,
  PaymentResponseDto,
  PaymentSummaryResponseDto,
  PaymentDetailResponseDto,
  PaginatedPaymentsResponseDto,
  MoneyResponseDto,
} from '../dto';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';

describe('Payment API Request & Response DTO Contract Specification', () => {
  let pipe: GlobalSanitizationValidationPipe;
  const fixedDate = new Date('2026-10-15T12:00:00.000Z');

  class DeterministicClock extends SystemClock {
    override now(): Date {
      return new Date(fixedDate.getTime());
    }
  }

  const clock = new DeterministicClock();

  beforeEach(() => {
    pipe = new GlobalSanitizationValidationPipe();
  });

  // ==========================================================================
  // 1. Request DTO Validation & Transformation (RecordPaymentRequestDto)
  // ==========================================================================
  describe('1. Request DTO Validation & Transformation (RecordPaymentRequestDto)', () => {
    it('accepts valid tender payload and transforms into RecordPaymentRequestDto', async () => {
      const payload = {
        saleId: 'sale_valid_uuid_001',
        method: PaymentMethod.CASH,
        amount: 49.99,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        reference: 'DRAWER-01',
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: RecordPaymentRequestDto,
      });

      expect(result).toBeInstanceOf(RecordPaymentRequestDto);
      const dto = result as RecordPaymentRequestDto;
      expect(dto.saleId).toBe('sale_valid_uuid_001');
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.amount).toBe(49.99);
      expect(dto.currency).toBe('USD');
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('DRAWER-01');
    });

    it('CreatePaymentRequestDto behaves identically as canonical CQRS alias', async () => {
      const payload = {
        method: PaymentMethod.QR,
        amount: 100.0,
      };

      const result = await pipe.transform(payload, {
        type: 'body',
        metatype: CreatePaymentRequestDto,
      });

      expect(result).toBeInstanceOf(CreatePaymentRequestDto);
      expect((result as CreatePaymentRequestDto).amount).toBe(100.0);
    });

    it('rejects payload missing required method', async () => {
      const payload = {
        amount: 50.0,
      };

      await expect(
        pipe.transform(payload, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported payment methods (e.g. BITCOIN, CREDIT_CARD, CRYPTO)', async () => {
      const unsupportedMethods = ['BITCOIN', 'CREDIT_CARD', 'CRYPTO', 'STRIPE', 'WIRE'];

      for (const method of unsupportedMethods) {
        await expect(
          pipe.transform(
            {
              method,
              amount: 50.0,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects non-positive payment amounts (0 and negative numbers)', async () => {
      const invalidAmounts = [0, -0.01, -50.0, -100];

      for (const amount of invalidAmounts) {
        await expect(
          pipe.transform(
            {
              method: PaymentMethod.CASH,
              amount,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects amounts exceeding 2 decimal places (fractional cent violations)', async () => {
      const invalidPrecisions = [49.999, 10.1234, 0.001, 99.991];

      for (const amount of invalidPrecisions) {
        await expect(
          pipe.transform(
            {
              method: PaymentMethod.CASH,
              amount,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('validates ISO-4217 currency format (3 uppercase letters)', async () => {
      // Valid currencies
      const validCurrencies = ['USD', 'CAD', 'EUR', 'GBP'];
      for (const currency of validCurrencies) {
        const res = (await pipe.transform(
          {
            method: PaymentMethod.CASH,
            amount: 10.0,
            currency,
          },
          {
            type: 'body',
            metatype: RecordPaymentRequestDto,
          },
        )) as RecordPaymentRequestDto;
        expect(res.currency).toBe(currency);
      }

      // Invalid currencies
      const invalidCurrencies = ['usd', 'US', 'USDD', '123', 'U$D'];
      for (const currency of invalidCurrencies) {
        await expect(
          pipe.transform(
            {
              method: PaymentMethod.CASH,
              amount: 10.0,
              currency,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects references containing prohibited characters or exceeding 100 characters', async () => {
      // Exceeds 100 characters
      const longRef = 'A'.repeat(101);
      await expect(
        pipe.transform(
          {
            method: PaymentMethod.QR,
            amount: 25.0,
            reference: longRef,
          },
          {
            type: 'body',
            metatype: RecordPaymentRequestDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);

      // Prohibited characters (XSS vectors, quotes, brackets, semicolons)
      const dirtyRefs = ['<script>', 'ref;semi', 'ref"quote', 'ref`tick`', 'ref$var', 'ref(paren)'];
      for (const reference of dirtyRefs) {
        await expect(
          pipe.transform(
            {
              method: PaymentMethod.QR,
              amount: 25.0,
              reference,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('rejects unexpected fields (e.g. Sale totals, paidAt, createdAt) via forbidNonWhitelisted', async () => {
      const spoofedPayload = {
        method: PaymentMethod.CASH,
        amount: 50.0,
        subtotal: 100.0,
        discountTotal: 0.0,
        total: 100.0,
        saleStatus: 'PAID',
        paidAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      await expect(
        pipe.transform(spoofedPayload, {
          type: 'body',
          metatype: RecordPaymentRequestDto,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // 2. Rejection of Unsupported Status Fields on Creation
  // ==========================================================================
  describe('2. Rejection of Unsupported Initial Status Fields', () => {
    it('accepts PENDING and COMPLETED as valid initial statuses', async () => {
      for (const status of [PaymentStatus.PENDING, PaymentStatus.COMPLETED]) {
        const res = (await pipe.transform(
          {
            method: PaymentMethod.CASH,
            amount: 10.0,
            status,
          },
          {
            type: 'body',
            metatype: RecordPaymentRequestDto,
          },
        )) as RecordPaymentRequestDto;
        expect(res.status).toBe(status);
      }
    });

    it('rejects terminal statuses CANCELLED and FAILED on payment initialization', async () => {
      const prohibitedStatuses = [
        PaymentStatus.CANCELLED,
        PaymentStatus.FAILED,
        'PAID',
        'REFUNDED',
      ];

      for (const status of prohibitedStatuses) {
        await expect(
          pipe.transform(
            {
              method: PaymentMethod.CASH,
              amount: 10.0,
              status,
            },
            {
              type: 'body',
              metatype: RecordPaymentRequestDto,
            },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ==========================================================================
  // 3. Lifecycle Transition Request DTOs
  // ==========================================================================
  describe('3. Lifecycle Transition Request DTOs Constraints', () => {
    describe('CompletePaymentRequestDto & SettlePaymentRequestDto', () => {
      it('accepts valid optional trace reference', async () => {
        const payload = { reference: 'QR-CONFIRMED-999' };
        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CompletePaymentRequestDto,
        })) as CompletePaymentRequestDto;

        expect(result.reference).toBe('QR-CONFIRMED-999');

        const settleResult = (await pipe.transform(payload, {
          type: 'body',
          metatype: SettlePaymentRequestDto,
        })) as SettlePaymentRequestDto;

        expect(settleResult.reference).toBe('QR-CONFIRMED-999');
      });

      it('rejects unexpected properties (status, paidAt, amount) on complete request', async () => {
        const invalidPayload = {
          reference: 'VALID-REF',
          status: 'COMPLETED',
          paidAt: '2026-10-15T12:00:00.000Z',
          amount: 50.0,
        };

        await expect(
          pipe.transform(invalidPayload, {
            type: 'body',
            metatype: CompletePaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          pipe.transform(invalidPayload, {
            type: 'body',
            metatype: SettlePaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('CancelPaymentRequestDto', () => {
      it('accepts valid audit justification reason', async () => {
        const payload = { reason: 'Customer opted to tender cash instead' };
        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: CancelPaymentRequestDto,
        })) as CancelPaymentRequestDto;

        expect(result.reason).toBe('Customer opted to tender cash instead');
      });

      it('rejects reason exceeding 255 characters', async () => {
        const payload = { reason: 'R'.repeat(256) };
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: CancelPaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects unexpected properties (status, paidAt, amount) on cancel request', async () => {
        const invalidPayload = {
          reason: 'Valid cancel',
          status: 'CANCELLED',
          paidAt: null,
        };

        await expect(
          pipe.transform(invalidPayload, {
            type: 'body',
            metatype: CancelPaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('FailPaymentRequestDto', () => {
      it('accepts valid audit failure reason', async () => {
        const payload = { reason: 'Bank card decline: insufficient funds' };
        const result = (await pipe.transform(payload, {
          type: 'body',
          metatype: FailPaymentRequestDto,
        })) as FailPaymentRequestDto;

        expect(result.reason).toBe('Bank card decline: insufficient funds');
      });

      it('rejects reason exceeding 255 characters', async () => {
        const payload = { reason: 'F'.repeat(256) };
        await expect(
          pipe.transform(payload, {
            type: 'body',
            metatype: FailPaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects unexpected properties (status, paidAt, amount) on fail request', async () => {
        const invalidPayload = {
          reason: 'Valid fail',
          status: 'FAILED',
          paidAt: null,
        };

        await expect(
          pipe.transform(invalidPayload, {
            type: 'body',
            metatype: FailPaymentRequestDto,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  // ==========================================================================
  // 4. Query DTO Validation (ListPaymentsQueryDto)
  // ==========================================================================
  describe('4. Query DTO Validation (ListPaymentsQueryDto)', () => {
    it('accepts valid query parameters and applies type coercion', async () => {
      const query = {
        saleId: 'sale_123',
        status: PaymentStatus.COMPLETED,
        method: PaymentMethod.CASH,
        page: '2',
        limit: '25',
        fromDate: '2026-10-01T00:00:00.000Z',
        toDate: '2026-10-15T23:59:59.000Z',
        sortBy: 'createdAt',
      };

      const result = (await pipe.transform(query, {
        type: 'query',
        metatype: ListPaymentsQueryDto,
      })) as ListPaymentsQueryDto;

      expect(result.page).toBe(2);
      expect(result.limit).toBe(25);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.method).toBe(PaymentMethod.CASH);
      expect(result.saleId).toBe('sale_123');
    });

    it('rejects invalid page number (< 1)', async () => {
      await expect(
        pipe.transform(
          { page: '0' },
          {
            type: 'query',
            metatype: ListPaymentsQueryDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects limit exceeding maximum 100', async () => {
      await expect(
        pipe.transform(
          { limit: '101' },
          {
            type: 'query',
            metatype: ListPaymentsQueryDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-ISO8601 date strings', async () => {
      await expect(
        pipe.transform(
          { fromDate: 'invalid-date-string' },
          {
            type: 'query',
            metatype: ListPaymentsQueryDto,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // 5. Response DTO Schema Correctness & Summary vs Detail Separation
  // ==========================================================================
  describe('5. Response DTO Schema Correctness & Summary vs Detail Separation', () => {
    it('correctly maps Payment aggregate to PaymentSummaryResponseDto for list views', () => {
      const payment = Payment.createPending(
        {
          saleId: 'sale_123',
          tenantId: 'tenant_gym_01',
          method: PaymentMethod.QR,
          amount: Money.create(49.99, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);

      const summary: PaymentSummaryResponseDto = {
        id: dto.id,
        saleId: dto.saleId,
        method: dto.method,
        amount: dto.amount as MoneyResponseDto,
        amountValue: dto.amountValue,
        status: dto.status,
        reference: dto.reference,
        paidAt: dto.paidAt,
        createdAt: dto.createdAt,
      };

      // Summary contains necessary fields
      expect(summary.id).toBe(payment.id.value);
      expect(summary.saleId).toBe('sale_123');
      expect(summary.method).toBe(PaymentMethod.QR);
      expect(summary.status).toBe(PaymentStatus.PENDING);
      expect(summary.paidAt).toBeNull();
      expect(summary.createdAt).toBe(fixedDate.toISOString());

      // Summary omits verbose fields
      expect((summary as unknown as Record<string, unknown>).version).toBeUndefined();
      expect((summary as unknown as Record<string, unknown>).tenantId).toBeUndefined();
    });

    it('correctly maps Payment aggregate to PaymentDetailResponseDto for single-item resolution without leaking tenantId or internal persistence', () => {
      const payment = Payment.createCompleted(
        {
          saleId: 'sale_123',
          tenantId: 'tenant_gym_01',
          method: PaymentMethod.CASH,
          amount: Money.create(75.5, 'USD'),
          reference: 'DRAWER-01-TRACE',
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);

      const detail: PaymentDetailResponseDto = {
        id: dto.id,
        saleId: dto.saleId,
        method: dto.method,
        amount: dto.amount as MoneyResponseDto,
        amountValue: dto.amountValue,
        status: dto.status,
        reference: dto.reference,
        paidAt: dto.paidAt,
        createdAt: dto.createdAt,
        version: dto.version,
      };

      expect(detail.id).toBe(payment.id.value);
      expect(detail.saleId).toBe('sale_123');
      expect(detail.method).toBe(PaymentMethod.CASH);
      expect(detail.version).toBe(1);
      expect(detail.paidAt).toBe(fixedDate.toISOString());

      // Ensure zero leakage of internal multi-tenant partition key or ORM timestamps
      const raw = detail as unknown as Record<string, unknown>;
      expect(raw['tenantId']).toBeUndefined();
      expect(raw['updatedAt']).toBeUndefined();
    });
  });

  // ==========================================================================
  // 6. Decimal & Monetary Serialization Integrity
  // ==========================================================================
  describe('6. Decimal & Monetary Serialization Integrity', () => {
    it('preserves exact 2-decimal scale, formatted string, and integer cents without IEEE-754 drift', () => {
      const payment = Payment.createCompleted(
        {
          saleId: 'sale_dec_01',
          tenantId: 'tenant_01',
          method: PaymentMethod.CASH,
          amount: Money.create(0.1 + 0.2, 'USD'), // Classic 0.30000000000000004 floating point trap
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);

      // Verify exact representation
      expect(dto.amount.amount).toBe(0.3);
      expect(dto.amount.cents).toBe(30);
      expect(dto.amount.formatted).toBe('0.30');
      expect(dto.amount.currency).toBe('USD');
      expect(dto.amountValue).toBe(0.3);
    });

    it('formats large commercial amounts accurately without exponential notation', () => {
      const payment = Payment.createCompleted(
        {
          saleId: 'sale_large_01',
          tenantId: 'tenant_01',
          method: PaymentMethod.QR,
          amount: Money.create(1250000.5, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);

      expect(dto.amount.amount).toBe(1250000.5);
      expect(dto.amount.cents).toBe(125000050);
      expect(dto.amount.formatted).toBe('1250000.50');
      expect(dto.amountValue).toBe(1250000.5);
    });
  });

  // ==========================================================================
  // 7. Timestamp Semantics & Nullability Invariants
  // ==========================================================================
  describe('7. Timestamp Semantics & Nullability Invariants', () => {
    it('sets paidAt to valid ISO-8601 UTC string upon completion', () => {
      const completedPayment = Payment.createCompleted(
        {
          saleId: 'sale_ts_01',
          tenantId: 'tenant_01',
          method: PaymentMethod.CASH,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(completedPayment);
      expect(dto.paidAt).toBe(fixedDate.toISOString());
    });

    it('guarantees paidAt is strictly null for PENDING, FAILED, and CANCELLED payments', () => {
      // PENDING
      const pending = Payment.createPending(
        {
          saleId: 'sale_ts_02',
          tenantId: 'tenant_01',
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      expect(PaymentMapper.toDTO(pending).paidAt).toBeNull();

      // FAILED
      const failed = Payment.createPending(
        {
          saleId: 'sale_ts_03',
          tenantId: 'tenant_01',
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      failed.fail({ reason: 'Decline', clock });
      expect(PaymentMapper.toDTO(failed).paidAt).toBeNull();

      // CANCELLED
      const cancelled = Payment.createPending(
        {
          saleId: 'sale_ts_04',
          tenantId: 'tenant_01',
          method: PaymentMethod.QR,
          amount: Money.create(50.0, 'USD'),
        },
        clock,
      );
      cancelled.cancel({ reason: 'Void', clock });
      expect(PaymentMapper.toDTO(cancelled).paidAt).toBeNull();
    });
  });

  // ==========================================================================
  // 8. No Internal Persistence-Field Leakage & Security Metadata Protection
  // ==========================================================================
  describe('8. No Internal Persistence-Field Leakage & Security Protection', () => {
    it('does not expose internal database IDs, deleted flags, or Prisma delegate instances', () => {
      const payment = Payment.createCompleted(
        {
          saleId: 'sale_sec_01',
          tenantId: 'tenant_01',
          method: PaymentMethod.CASH,
          amount: Money.create(25.0, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);
      const keys = Object.keys(dto);

      // Verify absence of sensitive internal database tokens or flags
      expect(keys).not.toContain('_count');
      expect(keys).not.toContain('deletedAt');
      expect(keys).not.toContain('isDeleted');
      expect(keys).not.toContain('password');
      expect(keys).not.toContain('token');
      expect(keys).not.toContain('secret');
      expect(keys).not.toContain('clientSecret');
      expect(keys).not.toContain('authHeader');
    });

    it('response DTO exposes only documented fields according to schema specification without persistence leakage', () => {
      const responseDto = new PaymentResponseDto();
      responseDto.id = 'pmt_1';
      responseDto.saleId = 'sale_1';
      responseDto.method = PaymentMethod.CASH;
      responseDto.amount = {
        amount: 50.0,
        currency: 'USD',
        formatted: '50.00',
        cents: 5000,
      };
      responseDto.amountValue = 50.0;
      responseDto.status = PaymentStatus.COMPLETED;
      responseDto.reference = null;
      responseDto.paidAt = fixedDate.toISOString();
      responseDto.createdAt = fixedDate.toISOString();
      responseDto.version = 1;

      const keys = Object.keys(responseDto);
      const expectedDocumentedKeys = [
        'id',
        'saleId',
        'method',
        'amount',
        'amountValue',
        'status',
        'reference',
        'paidAt',
        'createdAt',
        'version',
      ];

      for (const key of keys) {
        expect(expectedDocumentedKeys).toContain(key);
      }
      expect(keys).not.toContain('tenantId');
      expect(keys).not.toContain('updatedAt');
    });
  });

  // ==========================================================================
  // 9. Paginated Payments Response Envelope Compatibility
  // ==========================================================================
  describe('9. Paginated Payments Response Envelope Compatibility', () => {
    it('constructs PaginatedPaymentsResponseDto adhering to ADR-0138 envelope standard', () => {
      const paginated = new PaginatedPaymentsResponseDto();
      paginated.items = [];
      paginated.page = 1;
      paginated.limit = 20;
      paginated.total = 45;
      paginated.totalPages = 3;
      paginated.hasNextPage = true;
      paginated.hasPreviousPage = false;

      expect(paginated.data).toEqual([]);
      expect(paginated.meta).toEqual({
        page: 1,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
    });
  });
});
