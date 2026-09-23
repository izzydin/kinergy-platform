import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { RecordPaymentCommand } from '../commands/record-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { MoneyMapper } from '../mappers/money.mapper';
import { Payment } from '../../domain/payment.aggregate';
import { PaymentMethod, assertValidPaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus, isValidPaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleNotPayableException } from '../exceptions/sale-not-payable.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { InvalidPaymentStatusException } from '../../domain/exceptions/invalid-payment-status.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

export class RecordPaymentHandler implements SalesCommandHandler<
  RecordPaymentCommand,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: RecordPaymentCommand): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = command;

      // 1. Authorization & Identity
      checkPaymentAuthorization(input.currentUser, ['payments.create']);

      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      // 2. Sale Existence & Multi-Tenant Verification
      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      enforceTenantIsolation(sale.tenantId, input.tenantId);

      // 3. Sale Status Verification (must be payable)
      if (sale.status !== SaleStatus.PENDING_PAYMENT && sale.status !== SaleStatus.PARTIALLY_PAID) {
        return SalesApplicationResult.fail(new SaleNotPayableException(sale.id.value, sale.status));
      }

      // 4. Currency Homogeneity
      const paymentCurrency = (input.currency ?? sale.currency).trim().toUpperCase();
      if (paymentCurrency !== sale.currency) {
        return SalesApplicationResult.fail(
          new PaymentCurrencyMismatchException(paymentCurrency, sale.currency),
        );
      }

      // 5. Payment Method Invariant
      assertValidPaymentMethod(input.method);
      const method = input.method as PaymentMethod;

      // 6. Monetary Representation
      const paymentAmount = Money.create(input.amount, paymentCurrency);

      // 7. Balance & Overpayment Verification
      const existingPayments = await this.paymentRepository.findBySaleId(sale.id);
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

      // 8. Lifecycle Target State
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

      // 9. Aggregate Instantiation
      const payment =
        targetStatus === PaymentStatus.COMPLETED
          ? Payment.createCompleted(
              {
                saleId: sale.id,
                tenantId: sale.tenantId,
                method,
                amount: paymentAmount,
                reference: input.reference,
              },
              this.clock,
            )
          : Payment.createPending(
              {
                saleId: sale.id,
                tenantId: sale.tenantId,
                method,
                amount: paymentAmount,
                reference: input.reference,
              },
              this.clock,
            );

      // 10. Persistence
      await this.paymentRepository.save(payment);

      // 11. Coordinate Sale Status Transition if Completed
      if (payment.status === PaymentStatus.COMPLETED) {
        const newSettledTotal = settledTotal.add(payment.amount);
        if (newSettledTotal.greaterThanOrEqual(sale.total)) {
          sale.markPaid(this.clock);
        } else if (sale.status === SaleStatus.PENDING_PAYMENT) {
          sale.markPartiallyPaid(this.clock);
        }
        await this.saleRepository.save(sale);
      }

      // 12. Dispatch Domain Events
      const events = [...payment.getUncommittedEvents(), ...sale.getUncommittedEvents()];
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      payment.clearEvents();
      sale.clearEvents();

      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
