import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { FailPaymentCommand } from '../commands/fail-payment.command';
import { PaymentDTO } from '../dtos/payment.dto';
import { PaymentMapper } from '../mappers/payment.mapper';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { checkPaymentAuthorization, enforceTenantIsolation } from '../shared/payment-authorization';

export class FailPaymentHandler implements SalesCommandHandler<
  FailPaymentCommand,
  SalesApplicationResult<PaymentDTO>
> {
  constructor(
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: FailPaymentCommand): Promise<SalesApplicationResult<PaymentDTO>> {
    try {
      const { input } = command;

      // 1. Authorization
      checkPaymentAuthorization(input.currentUser, ['payments.create']);

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

      // 3. Domain State Transition
      payment.fail(input.reason ?? undefined, this.clock);

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
