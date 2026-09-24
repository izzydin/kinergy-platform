import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

/**
 * Application command handler orchestrating explicit Payment failure.
 * Transitions a PENDING payment to FAILED upon rail decline or timeout,
 * records failure audit reason, and persists with OCC verification.
 */
export class FailPaymentHandler implements SalesCommandHandler<
  FailPaymentCommand,
  SalesApplicationResult<PaymentDTO>
> {
  private readonly paymentRepository: PaymentRepositoryPort;
  private readonly saleRepository?: SaleRepositoryPort;
  private readonly clock: Clock;
  private readonly eventPublisher?: SalesEventPublisherPort;

  constructor(
    paymentRepository: PaymentRepositoryPort,
    arg2?: SaleRepositoryPort | Clock,
    arg3?: Clock | SalesEventPublisherPort,
    arg4?: SalesEventPublisherPort,
  ) {
    this.paymentRepository = paymentRepository;
    if (arg2 && 'findById' in arg2) {
      this.saleRepository = arg2 as SaleRepositoryPort;
      this.clock = arg3 && 'now' in arg3 ? (arg3 as Clock) : new SystemClock();
      this.eventPublisher = arg4;
    } else {
      this.clock = arg2 && 'now' in arg2 ? (arg2 as Clock) : new SystemClock();
      this.eventPublisher =
        arg3 && 'publish' in arg3 ? (arg3 as SalesEventPublisherPort) : undefined;
    }
  }

  public async execute(command: FailPaymentCommand): Promise<SalesApplicationResult<PaymentDTO>> {
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

      if (this.saleRepository) {
        const sale = await this.saleRepository.findById(payment.saleId);
        if (sale) {
          enforceTenantIsolation(sale.tenantId, input.tenantId);
          enforceTenantIsolation(sale.tenantId, payment.tenantId);
        }
      }

      // 5. Invoke Explicit Domain Behavior
      payment.fail(input.reason ?? undefined, this.clock);

      // 6. Persist Payment Aggregate (Enforces OCC version check at persistence layer)
      await this.paymentRepository.save(payment);

      // 7. Publish Domain Events
      const events = payment.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      payment.clearEvents();

      return SalesApplicationResult.ok(PaymentMapper.toDTO(payment));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
