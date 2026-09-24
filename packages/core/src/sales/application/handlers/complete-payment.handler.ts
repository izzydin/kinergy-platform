import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CompletePaymentCommand } from '../commands/complete-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

/**
 * Application command handler orchestrating explicit Payment completion.
 * Transitions a PENDING payment to COMPLETED, persists state with OCC verification,
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

      // 4b. Verify Associated Sale Access Before Domain Mutation
      const sale = await this.saleRepository.findById(payment.saleId);
      if (sale) {
        enforceTenantIsolation(sale.tenantId, input.tenantId);
        enforceTenantIsolation(sale.tenantId, payment.tenantId);
      }

      // 5. Invoke Explicit Domain Behavior
      payment.complete({
        reference: input.reference,
        paidAt: input.paidAt,
        clock: this.clock,
      });

      // 6. Persist Payment Aggregate (Enforces OCC version check at persistence layer)
      await this.paymentRepository.save(payment);

      // 7. Synchronize Associated Sale Settlement Balance
      if (sale) {
        const allPayments = await this.paymentRepository.findBySaleId(sale.id);
        const settledTotal = allPayments
          .filter((p) => p.status === PaymentStatus.COMPLETED)
          .reduce((acc, p) => acc.add(p.amount), Money.zero(sale.currency));

        if (settledTotal.greaterThanOrEqual(sale.total)) {
          sale.markPaid(this.clock);
        } else if (sale.status === SaleStatus.PENDING_PAYMENT) {
          sale.markPartiallyPaid(this.clock);
        }
        await this.saleRepository.save(sale);
      }

      // 8. Publish Domain Events
      const events = [
        ...payment.getUncommittedEvents(),
        ...(sale ? sale.getUncommittedEvents() : []),
      ];
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      payment.clearEvents();
      if (sale) {
        sale.clearEvents();
      }

      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
