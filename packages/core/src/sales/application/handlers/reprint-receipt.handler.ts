import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ReprintReceiptCommand } from '../commands/reprint-receipt.command';
import { ReceiptDTO } from '../dtos/receipt.dto';
import { ReceiptMapper } from '../mappers/receipt.mapper';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { ReceiptNotFoundException } from '../exceptions/receipt-not-found.exception';
import {
  checkReceiptAuthorization,
  enforceReceiptTenantIsolation,
} from '../shared/receipt-authorization';

export class ReprintReceiptHandler implements SalesCommandHandler<
  ReprintReceiptCommand,
  SalesApplicationResult<ReceiptDTO>
> {
  constructor(
    private readonly receiptRepository: ReceiptRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(
    command: ReprintReceiptCommand,
  ): Promise<SalesApplicationResult<ReceiptDTO>> {
    try {
      const { input } = command;

      // 1. Authorization: Reprinting duplicate vouchers is a sensitive permission (ADR-0117 Section 6)
      checkReceiptAuthorization(input.currentUser, ['receipts.manage']);

      const receiptId = input.receiptId?.trim();
      const saleId = input.saleId?.trim();

      if (!receiptId && !saleId) {
        return SalesApplicationResult.fail(
          new Error('Either receiptId or saleId must be provided to reprint a receipt.'),
        );
      }

      // 2. Locate Receipt
      let receipt = receiptId ? await this.receiptRepository.findById(receiptId) : null;
      if (!receipt && saleId) {
        receipt = await this.receiptRepository.findBySaleId(saleId);
      }

      if (!receipt) {
        return SalesApplicationResult.fail(
          new ReceiptNotFoundException(receiptId ?? saleId ?? 'unknown'),
        );
      }

      // 3. Multi-Tenant Isolation
      enforceReceiptTenantIsolation(receipt.tenantId, input.tenantId);

      // 4. Domain Transition: Record Duplicate Reprint (ADR-0117 Section 5)
      receipt.recordReprint(this.clock);

      // 5. Atomic Persistence
      await this.receiptRepository.save(receipt);

      // 6. Domain Event Dispatching
      const events = receipt.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      receipt.clearEvents();

      return SalesApplicationResult.ok(ReceiptMapper.toDTO(receipt));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
