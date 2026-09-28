import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CoordinateSalePaymentCommand } from '../commands/coordinate-sale-payment.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SalePaymentCoordinationService } from '../services/sale-payment-coordination.service';
import { checkPaymentAuthorization } from '../shared/payment-authorization';

export class CoordinateSalePaymentHandler implements SalesCommandHandler<
  CoordinateSalePaymentCommand,
  SalesApplicationResult<SaleDTO>
> {
  private readonly coordinationService: SalePaymentCoordinationService;

  constructor(
    saleRepository: SaleRepositoryPort,
    paymentRepository: PaymentRepositoryPort,
    clock: Clock = new SystemClock(),
    eventPublisher?: SalesEventPublisherPort,
  ) {
    this.coordinationService = new SalePaymentCoordinationService(
      saleRepository,
      paymentRepository,
      clock,
      eventPublisher,
    );
  }

  public async execute(
    command: CoordinateSalePaymentCommand,
  ): Promise<SalesApplicationResult<SaleDTO>> {
    const { input } = command;

    if (input.currentUser) {
      checkPaymentAuthorization(input.currentUser, ['payments.create', 'payments.manage']);
    }

    return this.coordinationService.coordinateSalePaymentSettlement({
      saleId: input.saleId,
      paymentId: input.paymentId,
      tenantId: input.tenantId,
    });
  }
}
