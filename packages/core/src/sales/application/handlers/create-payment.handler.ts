import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CreatePaymentCommand } from '../commands/create-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { MoneyMapper } from '../mappers/money.mapper';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentMethod, assertValidPaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus, isValidPaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentReference } from '../../domain/value-objects/payment-reference.vo';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleNotPayableException } from '../exceptions/sale-not-payable.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { DuplicatePaymentReferenceException } from '../exceptions/duplicate-payment-reference.exception';
import { InvalidPaymentStatusException } from '../../domain/exceptions/invalid-payment-status.exception';
import { PaymentDomainException } from '../../domain/exceptions/payment-domain.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

/**
 * Enterprise Application Command Handler for creating / recording monetary payments.
 *
 * Conforms strictly to Clean Architecture, DDD, and Milestone 7.6 / 7.12 (ADR-0116, ADR-0133):
 * 1. Validates application input (shape, identity, tenant isolation, permissions).
 * 2. Loads referenced Sale through SaleRepositoryPort.
 * 3. Rejects creation if Sale does not exist or is not in payable state.
 * 4. Validates currency homogeneity and method through Payment domain invariants.
 * 5. Validates amount and balance through canonical Money value objects (no floating-point arithmetic).
 * 6. Detects and rejects duplicate payment references for the same Sale.
 * 7. Determines initial state according to Milestone 7.6 (PENDING or COMPLETED; rejects arbitrary states).
 * 8. Constructs Payment aggregate through domain factory methods (no bypass of domain construction).
 * 9. Persists Payment through PaymentRepositoryPort.
 * 10. Coordinates Sale status transitions (markPartiallyPaid / markPaid) through domain methods (no direct field mutation).
 * 11. Dispatches domain events strictly post-commit.
 * 12. Returns approved application representation (PaymentDTO).
 */
export class CreatePaymentHandler implements SalesCommandHandler<
  CreatePaymentCommand,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: CreatePaymentCommand): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = command;

      // 1. Authorization & Identity Verification
      checkPaymentAuthorization(input.currentUser, ['payments.create']);

      // 2. Validate Application Input (syntactic checks, non-empty IDs)
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      if (typeof input.amount !== 'number' || isNaN(input.amount) || !isFinite(input.amount)) {
        return SalesApplicationResult.fail(
          new Error('Payment amount must be a valid finite number.'),
        );
      }

      if (
        input.method === undefined ||
        input.method === null ||
        (typeof input.method === 'string' && input.method.trim().length === 0)
      ) {
        return SalesApplicationResult.fail(new Error('Payment method cannot be empty.'));
      }

      // 3. Load Referenced Sale & Reject If Not Found
      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // Enforce multi-tenant boundary isolation
      enforceTenantIsolation(sale.tenantId, input.tenantId);

      // Verify Sale status is payable (must be PENDING_PAYMENT or PARTIALLY_PAID)
      if (sale.status !== SaleStatus.PENDING_PAYMENT && sale.status !== SaleStatus.PARTIALLY_PAID) {
        return SalesApplicationResult.fail(new SaleNotPayableException(sale.id.value, sale.status));
      }

      // 4. Validate Currency Through Domain (homogeneity check)
      const paymentCurrency = (input.currency ?? sale.currency).trim().toUpperCase();
      if (paymentCurrency !== sale.currency) {
        return SalesApplicationResult.fail(
          new PaymentCurrencyMismatchException(paymentCurrency, sale.currency),
        );
      }

      // 5. Validate Method Through Domain Invariants
      assertValidPaymentMethod(input.method);
      const method = input.method as PaymentMethod;

      // 6. Validate Amount Through Payment Domain (canonical Money VO invariants)
      const paymentAmount = Money.create(input.amount, paymentCurrency);
      if (paymentAmount.cents <= 0) {
        return SalesApplicationResult.fail(
          new PaymentDomainException(
            `Payment amount must be strictly greater than zero. Received: ${paymentAmount.toString()}.`,
            'PAYMENT_AMOUNT_MUST_BE_POSITIVE',
          ),
        );
      }

      // 7. Validate Reference & Check Duplicate Reference For Referenced Sale
      const reference = PaymentReference.from(input.reference);
      const existingPayments = await this.paymentRepository.findBySaleId(sale.id);

      if (reference !== null) {
        const isDuplicateRef = existingPayments.some(
          (p) =>
            p.reference !== null &&
            p.reference.value.toLowerCase() === reference.value.toLowerCase(),
        );
        if (isDuplicateRef) {
          return SalesApplicationResult.fail(
            new DuplicatePaymentReferenceException(reference.value, sale.id.value),
          );
        }
      }

      // 8. Balance & Overpayment Verification (calculated with exact Money arithmetic)
      const settledTotal = existingPayments
        .filter((p) => p.status === PaymentStatus.COMPLETED)
        .reduce((acc, p) => acc.add(p.amount), Money.zero(paymentCurrency));

      const remainingBalance = sale.total.subtract(settledTotal, { allowNegative: true });

      if (paymentAmount.greaterThan(remainingBalance)) {
        return SalesApplicationResult.fail(
          new PaymentOverpaymentException(
            MoneyMapper.toDTO(paymentAmount).formatted,
            MoneyMapper.toDTO(remainingBalance).formatted,
            paymentCurrency,
          ),
        );
      }

      // 9. Initial Payment State According to Milestone 7.6
      // In accordance with Milestone 7.6 and ADR-0116:
      // Initial state is either PENDING (initiated tender) or COMPLETED (immediate counter tender).
      // Callers are strictly forbidden from creating arbitrary states (e.g. CANCELLED, FAILED).
      let targetStatus: PaymentStatus = PaymentStatus.COMPLETED;
      if (input.status) {
        if (!isValidPaymentStatus(input.status)) {
          throw new InvalidPaymentStatusException(input.status);
        }
        targetStatus = input.status as PaymentStatus;
      }

      if (targetStatus !== PaymentStatus.COMPLETED && targetStatus !== PaymentStatus.PENDING) {
        throw new Error(
          `Initial payment status must be PENDING or COMPLETED. Cannot instantiate in status '${targetStatus}'.`,
        );
      }

      // 10. Construct Payment Domain Representation via Domain Factories
      // Do not allow request DTO to bypass domain construction or control paidAt
      const payment =
        targetStatus === PaymentStatus.COMPLETED
          ? Payment.createCompleted(
              {
                saleId: sale.id,
                tenantId: sale.tenantId,
                method,
                amount: paymentAmount,
                reference,
              },
              this.clock,
            )
          : Payment.createPending(
              {
                saleId: sale.id,
                tenantId: sale.tenantId,
                method,
                amount: paymentAmount,
                reference,
              },
              this.clock,
            );

      // 11. Persist Payment Through PaymentRepositoryPort
      await this.paymentRepository.save(payment);

      // 12. Establish / Coordinate Sale Relationship and State Transition If Completed
      // Application layer invokes domain methods (markPaid / markPartiallyPaid) - does NOT mutate Sale directly
      if (payment.status === PaymentStatus.COMPLETED) {
        const newSettledTotal = settledTotal.add(payment.amount);
        if (newSettledTotal.greaterThanOrEqual(sale.total)) {
          sale.markPaid(this.clock);
        } else if (sale.status === SaleStatus.PENDING_PAYMENT) {
          sale.markPartiallyPaid(this.clock);
        }
        await this.saleRepository.save(sale);
      }

      // 13. Dispatch Domain Events Post-Commit
      const events = [...payment.getUncommittedEvents(), ...sale.getUncommittedEvents()];
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      payment.clearEvents();
      sale.clearEvents();

      // 14. Return Approved Application Representation
      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
