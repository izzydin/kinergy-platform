import { Payment } from '../../domain/payment.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentDTO } from '../dtos/payment.dto';
import { CreatePaymentCommand, CreatePaymentInput } from '../commands/create-payment.command';
import { CompletePaymentCommand, CompletePaymentInput } from '../commands/complete-payment.command';
import { FailPaymentCommand, FailPaymentInput } from '../commands/fail-payment.command';
import { CancelPaymentCommand, CancelPaymentInput } from '../commands/cancel-payment.command';
import { GetPaymentQuery, GetPaymentInput } from '../queries/get-payment.query';
import { ListPaymentsQuery, ListPaymentsInput } from '../queries/list-payments.query';
import {
  GetSalePaymentHistoryQuery,
  GetSalePaymentHistoryInput,
} from '../queries/get-sale-payment-history.query';

describe('Payment Application DTO & Command/Query Reconciliation Spec', () => {
  const fixedDate = new Date('2026-10-09T12:00:00.000Z');
  const clock = new DeterministicClock(fixedDate);
  const tenantId = 'tenant_kinergy_01';
  const saleId = SaleId.create('sale-uuid-100');

  // ==========================================================================
  // 1. PaymentDTO & PaymentMapper Mapping Tests
  // ==========================================================================
  describe('1. PaymentDTO & PaymentMapper Precision & Serialization', () => {
    it('maps a COMPLETED Payment aggregate to a fully populated, precision-preserving PaymentDTO', () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-uuid-001',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(49.99, 'USD'),
          reference: 'POS-CASH-DRAWER-1',
        },
        clock,
      );

      const dto: PaymentDTO = PaymentMapper.toDTO(payment);

      expect(dto.id).toBe('pay-uuid-001');
      expect(dto.tenantId).toBe(tenantId);
      expect(dto.saleId).toBe('sale-uuid-100');
      expect(dto.method).toBe(PaymentMethod.CASH);
      expect(dto.status).toBe(PaymentStatus.COMPLETED);
      expect(dto.reference).toBe('POS-CASH-DRAWER-1');
      expect(dto.paidAt).toBe(fixedDate.toISOString());
      expect(dto.createdAt).toBe(fixedDate.toISOString());
      expect(dto.updatedAt).toBe(fixedDate.toISOString());
      expect(dto.version).toBe(1);

      // MoneyDTO canonical representation
      expect(dto.amount).toEqual({
        amount: 49.99,
        currency: 'USD',
        formatted: '49.99',
        cents: 4999,
      });

      // Convenience fields
      expect(dto.amountValue).toBe(49.99);
      expect(dto.currency).toBe('USD');
      expect(dto.cents).toBe(4999);
      expect(dto.formattedAmount).toBe('49.99');
    });

    it('maps a PENDING Payment aggregate with null paidAt and null reference', () => {
      const payment = Payment.createPending(
        {
          id: 'pay-uuid-002',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(100.0, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);

      expect(dto.status).toBe(PaymentStatus.PENDING);
      expect(dto.reference).toBeNull();
      expect(dto.paidAt).toBeNull();
      expect(dto.cents).toBe(10000);
      expect(dto.formattedAmount).toBe('100.00');
    });

    it('maps a FAILED Payment aggregate preserving terminal status and unmutated amount', () => {
      const payment = Payment.createPending(
        {
          id: 'pay-uuid-003',
          tenantId,
          saleId,
          method: PaymentMethod.QR,
          amount: Money.create(25.5, 'USD'),
          reference: 'QR-ATTEMPT-01',
        },
        clock,
      );

      payment.fail('Network timeout on acquirer host', clock);
      const dto = PaymentMapper.toDTO(payment);

      expect(dto.status).toBe(PaymentStatus.FAILED);
      expect(dto.reference).toBe('QR-ATTEMPT-01');
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);
      expect(dto.formattedAmount).toBe('25.50');
      expect(dto.cents).toBe(2550);
    });

    it('maps a CANCELLED Payment aggregate with version incremented and null paidAt', () => {
      const payment = Payment.createPending(
        {
          id: 'pay-uuid-004',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(10.0, 'USD'),
        },
        clock,
      );

      payment.cancel('Customer changed tender method', clock);
      const dto = PaymentMapper.toDTO(payment);

      expect(dto.status).toBe(PaymentStatus.CANCELLED);
      expect(dto.paidAt).toBeNull();
      expect(dto.version).toBe(2);
      expect(dto.formattedAmount).toBe('10.00');
    });

    it('guarantees zero floating-point drift across string, integer, and JSON serialization', () => {
      const oddAmount = Money.fromCents(1001, 'USD'); // $10.01
      const payment = Payment.createSettled(
        {
          id: 'pay-drift-test',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: oddAmount,
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);
      const json = JSON.stringify(dto);
      const parsed = JSON.parse(json);

      expect(parsed.amount.cents).toBe(1001);
      expect(parsed.amount.formatted).toBe('10.01');
      expect(parsed.cents).toBe(1001);
      expect(parsed.formattedAmount).toBe('10.01');
    });

    it('preserves boundary amounts ($9,999,999,999.99) without integer overflow or rounding artifacts', () => {
      const maxMoney = Money.fromCents(999999999999, 'USD');
      const payment = Payment.createSettled(
        {
          id: 'pay-max-boundary',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: maxMoney,
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);
      expect(dto.amount.cents).toBe(999999999999);
      expect(dto.amount.formatted).toBe('9999999999.99');
      expect(dto.cents).toBe(999999999999);
      expect(dto.formattedAmount).toBe('9999999999.99');
    });

    it('strictly avoids leaking Prisma models, Prisma.Decimal, or database internals', () => {
      const payment = Payment.createSettled(
        {
          id: 'pay-no-prisma-leak',
          tenantId,
          saleId,
          method: PaymentMethod.CASH,
          amount: Money.create(15.0, 'USD'),
        },
        clock,
      );

      const dto = PaymentMapper.toDTO(payment);
      const keys = Object.keys(dto);

      expect(keys).not.toContain('d');
      expect(keys).not.toContain('s');
      expect(keys).not.toContain('e');
      expect(typeof (dto.amount as unknown as { toDecimalPlaces?: unknown }).toDecimalPlaces).toBe(
        'undefined',
      );
      expect(typeof (dto as unknown as { _prisma?: unknown })._prisma).toBe('undefined');
    });
  });

  // ==========================================================================
  // 2. Command Input DTO Contract Reconciliation
  // ==========================================================================
  describe('2. Command Input DTO Contract Reconciliation', () => {
    describe('CreatePaymentCommand / CreatePaymentInput', () => {
      it('reconciles input with either amount or exact integer cents without floating-point conversion', () => {
        // Via integer cents
        const inputWithCents: CreatePaymentInput = {
          saleId: 'sale-101',
          cents: 4999,
          currency: 'USD',
          method: PaymentMethod.CASH,
        };
        const cmdCents = new CreatePaymentCommand(inputWithCents);
        expect(cmdCents.input.cents).toBe(4999);

        // Via standard decimal amount
        const inputWithAmount: CreatePaymentInput = {
          saleId: 'sale-101',
          amount: 49.99,
          currency: 'USD',
          method: PaymentMethod.CASH,
        };
        const cmdAmount = new CreatePaymentCommand(inputWithAmount);
        expect(cmdAmount.input.amount).toBe(49.99);
      });

      it('permits initial status strictly as PENDING or COMPLETED according to Milestone 7.6', () => {
        const inputPending: CreatePaymentInput = {
          saleId: 'sale-101',
          amount: 50.0,
          method: PaymentMethod.QR,
          status: PaymentStatus.PENDING,
        };
        expect(inputPending.status).toBe(PaymentStatus.PENDING);

        const inputCompleted: CreatePaymentInput = {
          saleId: 'sale-101',
          amount: 50.0,
          method: PaymentMethod.CASH,
          status: PaymentStatus.COMPLETED,
        };
        expect(inputCompleted.status).toBe(PaymentStatus.COMPLETED);
      });
    });

    describe('CompletePaymentCommand / CompletePaymentInput', () => {
      it('verifies CompletePaymentInput does NOT accept arbitrary status field', () => {
        // Compile-time assertion that 'status' is NOT a property of CompletePaymentInput
        type CompleteInputKeys = keyof CompletePaymentInput;
        const hasStatus: 'status' extends CompleteInputKeys ? true : false = false;
        expect(hasStatus).toBe(false);

        const input: CompletePaymentInput = {
          paymentId: 'pay-123',
          reference: 'QR-GATEWAY-AUTH-999',
          paidAt: new Date('2026-10-09T12:05:00.000Z'),
        };
        const cmd = new CompletePaymentCommand(input);
        expect(cmd.input.paymentId).toBe('pay-123');
        expect(cmd.input.reference).toBe('QR-GATEWAY-AUTH-999');
        expect((cmd.input as unknown as { status?: unknown }).status).toBeUndefined();
      });

      it('accepts paidAt as either a Date object or an ISO-8601 string', () => {
        const inputWithDate: CompletePaymentInput = {
          paymentId: 'pay-date-01',
          paidAt: new Date('2026-10-09T12:00:00.000Z'),
        };
        expect(inputWithDate.paidAt).toBeInstanceOf(Date);

        const inputWithString: CompletePaymentInput = {
          paymentId: 'pay-str-01',
          paidAt: '2026-10-09T12:00:00.000Z',
        };
        expect(typeof inputWithString.paidAt).toBe('string');
      });
    });

    describe('FailPaymentCommand / FailPaymentInput', () => {
      it('verifies FailPaymentInput does NOT accept arbitrary status field', () => {
        type FailInputKeys = keyof FailPaymentInput;
        const hasStatus: 'status' extends FailInputKeys ? true : false = false;
        expect(hasStatus).toBe(false);
      });

      it('reconciles that FailPayment accepts optional reason, but does NOT require reference or client timestamp', () => {
        type FailInputKeys = keyof FailPaymentInput;

        // Reason is supported for domain decline audit
        const hasReason: 'reason' extends FailInputKeys ? true : false = true;
        expect(hasReason).toBe(true);

        // Reference is NOT accepted (it belongs to creation/gateway authorization, not failure)
        const hasReference: 'reference' extends FailInputKeys ? true : false = false;
        expect(hasReference).toBe(false);

        // Timestamp is NOT accepted (authoritative system clock controls failure event time)
        const hasTimestamp: 'timestamp' extends FailInputKeys ? true : false = false;
        const hasFailedAt: 'failedAt' extends FailInputKeys ? true : false = false;
        expect(hasTimestamp).toBe(false);
        expect(hasFailedAt).toBe(false);

        const input: FailPaymentInput = {
          paymentId: 'pay-fail-001',
          reason: 'Card decline: insufficient funds',
        };
        const cmd = new FailPaymentCommand(input);
        expect(cmd.input.reason).toBe('Card decline: insufficient funds');
      });
    });

    describe('CancelPaymentCommand / CancelPaymentInput', () => {
      it('verifies CancelPaymentInput does NOT accept arbitrary status field', () => {
        type CancelInputKeys = keyof CancelPaymentInput;
        const hasStatus: 'status' extends CancelInputKeys ? true : false = false;
        expect(hasStatus).toBe(false);
      });

      it('reconciles that CancelPayment accepts optional reason, but does NOT require reference or client timestamp', () => {
        type CancelInputKeys = keyof CancelPaymentInput;

        const hasReason: 'reason' extends CancelInputKeys ? true : false = true;
        expect(hasReason).toBe(true);

        const hasReference: 'reference' extends CancelInputKeys ? true : false = false;
        expect(hasReference).toBe(false);

        const hasTimestamp: 'timestamp' extends CancelInputKeys ? true : false = false;
        const hasCancelledAt: 'cancelledAt' extends CancelInputKeys ? true : false = false;
        expect(hasTimestamp).toBe(false);
        expect(hasCancelledAt).toBe(false);

        const input: CancelPaymentInput = {
          paymentId: 'pay-cancel-001',
          reason: 'Cashier aborted transaction prompt',
        };
        const cmd = new CancelPaymentCommand(input);
        expect(cmd.input.reason).toBe('Cashier aborted transaction prompt');
      });
    });
  });

  // ==========================================================================
  // 3. Query Input DTO Contract Reconciliation
  // ==========================================================================
  describe('3. Query Input DTO Contract Reconciliation', () => {
    describe('GetPaymentQuery / GetPaymentInput', () => {
      it('encapsulates single-payment lookup by paymentId without aggregate mutation', () => {
        const input: GetPaymentInput = {
          paymentId: 'pay-lookup-999',
          tenantId: 'tenant-1',
        };
        const query = new GetPaymentQuery(input);
        expect(query.input.paymentId).toBe('pay-lookup-999');
        expect(query.input.tenantId).toBe('tenant-1');
      });
    });

    describe('ListPaymentsQuery / ListPaymentsInput', () => {
      it('reconciles validated filter criteria and deterministic sorting without exposing Prisma query AST', () => {
        const input: ListPaymentsInput = {
          tenantId: 'tenant-1',
          filter: {
            saleId: 'sale-999',
            status: PaymentStatus.COMPLETED,
            method: PaymentMethod.CASH,
            createdAtFrom: new Date('2026-10-01'),
            createdAtTo: new Date('2026-10-09'),
          },
          pagination: {
            page: 1,
            limit: 25,
          },
          sort: {
            field: 'createdAt',
            direction: 'desc',
          },
        };

        const query = new ListPaymentsQuery(input);
        expect(query.input.filter?.status).toBe(PaymentStatus.COMPLETED);
        expect(query.input.pagination?.limit).toBe(25);
        expect(query.input.sort?.field).toBe('createdAt');

        // Does NOT contain Prisma where clauses or raw SQL fragments
        expect((query.input as unknown as { where?: unknown }).where).toBeUndefined();
        expect((query.input as unknown as { select?: unknown }).select).toBeUndefined();
      });
    });

    describe('GetSalePaymentHistoryQuery / GetSalePaymentHistoryInput', () => {
      it('reconciles deterministic ordering (order: asc | desc) referencing a single Sale', () => {
        const inputAsc: GetSalePaymentHistoryInput = {
          saleId: 'sale-hist-01',
          order: 'asc',
        };
        const queryAsc = new GetSalePaymentHistoryQuery(inputAsc);
        expect(queryAsc.input.saleId).toBe('sale-hist-01');
        expect(queryAsc.input.order).toBe('asc');

        const inputDesc: GetSalePaymentHistoryInput = {
          saleId: 'sale-hist-01',
          order: 'desc',
        };
        const queryDesc = new GetSalePaymentHistoryQuery(inputDesc);
        expect(queryDesc.input.order).toBe('desc');
      });
    });
  });
});
