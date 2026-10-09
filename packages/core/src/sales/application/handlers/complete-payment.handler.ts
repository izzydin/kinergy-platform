import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { MoneyMapper } from '../mappers/money.mapper';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { IUnitOfWork } from '../ports/unit-of-work.port';
import { SalesTransactionCoordinatorPort } from '../ports/sales-transaction-coordinator.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { PaymentOverpaymentException } from '../exceptions/payment-overpayment.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

/**
 * Application command handler orchestrating explicit Payment completion.
 * Transitions a PENDING payment to COMPLETED, persists state atomically with OCC verification,
 * and synchronizes parent Sale settlement totals without duplicating domain rules.
 */
export class CompletePaymentHandler implements SalesCommandHandler<
  CompletePaymentCommand,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
    private readonly unitOfWork?: IUnitOfWork | SalesTransactionCoordinatorPort,
  ) {}

  public async execute(
    command: CompletePaymentCommand,
  ): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = command;

      // 1. Authorization: payments.create or payments.manage
      checkPaymentAuthorization(input.currentUser, ['payments.create', 'payments.manage']);

      const paymentId = input.paymentId?.trim();
      if (!paymentId) {
        return SalesApplicationResult.fail(new Error('Payment ID cannot be empty.'));
      }

      // 2. Resolve Payment Aggregate
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return SalesApplicationResult.fail(new PaymentNotFoundException(paymentId));
      }

      // 3. Multi-Tenant Boundary Enforcement
      enforceTenantIsolation(payment.tenantId, input.tenantId);

      // 4. Sale Scoping Verification (if caller provided explicit saleId)
      if (input.saleId && payment.saleId.value !== input.saleId.trim()) {
        return SalesApplicationResult.fail(
          new PaymentUnauthorizedException('Payment does not belong to the specified Sale.'),
        );
      }

      // 5. Resolve Associated Sale Aggregate
      const sale = await this.saleRepository.findById(payment.saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(payment.saleId.value));
      }

      enforceTenantIsolation(sale.tenantId, input.tenantId);
      enforceTenantIsolation(sale.tenantId, payment.tenantId);

      // 6. Currency Parity Precondition Check
      if (payment.amount.currency !== sale.currency) {
        return SalesApplicationResult.fail(
          new PaymentCurrencyMismatchException(payment.amount.currency, sale.currency),
        );
      }

      // 7. Verify Remaining Balance & Prevent Overpayments
      const allPayments = await this.paymentRepository.findBySaleId(sale.id);
      const settledTotalBefore = allPayments
        .filter((p) => p.status === PaymentStatus.COMPLETED && p.id.value !== payment.id.value)
        .reduce((acc, p) => acc.add(p.amount), Money.zero(sale.currency));

      const remainingBalance = sale.total.subtract(settledTotalBefore, { allowNegative: true });
      if (payment.amount.greaterThan(remainingBalance)) {
        return SalesApplicationResult.fail(
          new PaymentOverpaymentException(
            MoneyMapper.toDTO(payment.amount).formatted,
            MoneyMapper.toDTO(remainingBalance).formatted,
            sale.currency,
          ),
        );
      }

      // 8. Invoke Payment Domain Behavior: payment.complete()
      // Payment aggregate decides whether transition is legal (throws InvalidPaymentTransitionException)
      const resolvedPaidAt =
        typeof input.paidAt === 'string' ? new Date(input.paidAt) : input.paidAt;

      payment.complete({
        reference: input.reference,
        paidAt: resolvedPaidAt,
        clock: this.clock,
      });

      // 9. Invoke Sale Domain Behavior: sale.markPaid(...) or sale.markPartiallyPaid(...)
      // Sale aggregate decides whether transition is legal (throws InvalidSaleTransitionException)
      const cumulativeSettled = settledTotalBefore.add(payment.amount);
      if (cumulativeSettled.greaterThanOrEqual(sale.total)) {
        sale.markPaid(this.clock);
      } else {
        sale.markPartiallyPaid(this.clock);
      }

      // 10. Persist State Atomically
      // Enclose strictly the persistence step in the unit of work to keep the transaction boundary minimal.
      const persistWork = async () => {
        await this.paymentRepository.save(payment);
        await this.saleRepository.save(sale);
      };

      if (this.unitOfWork) {
        if (
          'executeInTransaction' in this.unitOfWork &&
          typeof this.unitOfWork.executeInTransaction === 'function'
        ) {
          await this.unitOfWork.executeInTransaction(persistWork);
        } else if (
          'runInTransaction' in this.unitOfWork &&
          typeof (this.unitOfWork as unknown as { runInTransaction: unknown }).runInTransaction ===
            'function'
        ) {
          await (
            this.unitOfWork as unknown as {
              runInTransaction: (fn: () => Promise<void>) => Promise<void>;
            }
          ).runInTransaction(persistWork);
        } else {
          await persistWork();
        }
      } else {
        await persistWork();
      }

      // 11. Publish Domain Events Post-Commit
      const events = [...payment.getUncommittedEvents(), ...sale.getUncommittedEvents()];
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      payment.clearEvents();
      sale.clearEvents();

      // 12. Return Final Application Representation
      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
