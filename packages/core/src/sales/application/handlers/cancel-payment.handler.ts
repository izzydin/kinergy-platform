import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CancelPaymentCommand } from '../commands/cancel-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentUnauthorizedException } from '../exceptions/payment-unauthorized.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

export class CancelPaymentHandler implements SalesCommandHandler<
  CancelPaymentCommand,
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
    arg4?: SalesEventPublisherPort | SaleRepositoryPort,
  ) {
    this.paymentRepository = paymentRepository;
    if (arg2 && 'findById' in arg2) {
      this.saleRepository = arg2 as SaleRepositoryPort;
      this.clock = arg3 && 'now' in arg3 ? (arg3 as Clock) : new SystemClock();
      this.eventPublisher =
        arg4 && 'publish' in arg4 ? (arg4 as SalesEventPublisherPort) : undefined;
    } else {
      this.clock = arg2 && 'now' in arg2 ? (arg2 as Clock) : new SystemClock();
      this.eventPublisher =
        arg3 && 'publish' in arg3 ? (arg3 as SalesEventPublisherPort) : undefined;
      this.saleRepository =
        arg4 && 'findById' in arg4 ? (arg4 as unknown as SaleRepositoryPort) : undefined;
    }
  }

  public async execute(command: CancelPaymentCommand): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = command;

      // 1. Authorization: payments.manage required for cancelling financial records
      checkPaymentAuthorization(
        input.currentUser,
        ['payments.manage'],
        ['Owner', 'Manager', 'Receptionist'],
      );

      const paymentId = input.paymentId?.trim();
      if (!paymentId) {
        return SalesApplicationResult.fail(new Error('Payment ID cannot be empty.'));
      }

      // 2. Resolve Payment
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) {
        return SalesApplicationResult.fail(new PaymentNotFoundException(paymentId));
      }

      enforceTenantIsolation(payment.tenantId, input.tenantId);

      // 3. Sale Scoping Verification
      if (input.saleId && payment.saleId.value !== input.saleId.trim()) {
        return SalesApplicationResult.fail(
          new PaymentUnauthorizedException('Payment does not belong to the specified Sale.'),
        );
      }

      if (this.saleRepository) {
        const sale = await this.saleRepository.findById(payment.saleId);
        if (sale) {
          enforceTenantIsolation(sale.tenantId, input.tenantId);
        }
      }

      // 3. Domain State Transition
      payment.cancel(input.reason ?? undefined, this.clock);

      // 4. Persistence
      await this.paymentRepository.save(payment);

      // 5. Domain Events
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
