import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { IssueReceiptCommand } from '../commands/issue-receipt.command';
import { ReceiptDTO } from '../dtos/receipt.dto';
import { ReceiptMapper } from '../mappers/receipt.mapper';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { ClientFacadePort, ClientSummaryPayload } from '../ports/client-facade.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { Receipt } from '../../domain/receipt.aggregate';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { ReceiptIssuanceRejectedException } from '../exceptions/receipt-issuance-rejected.exception';
import { DuplicateReceiptException } from '../../domain/exceptions/duplicate-receipt.exception';
import {
  checkReceiptAuthorization,
  enforceReceiptTenantIsolation,
} from '../shared/receipt-authorization';

export class IssueReceiptHandler implements SalesCommandHandler<
  IssueReceiptCommand,
  SalesApplicationResult<ReceiptDTO>
> {
  constructor(
    private readonly receiptRepository: ReceiptRepositoryPort,
    private readonly saleRepository: SaleRepositoryPort,
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly clientFacade?: ClientFacadePort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: IssueReceiptCommand): Promise<SalesApplicationResult<ReceiptDTO>> {
    const { input } = command;
    try {
      // 1. Authorization & Role Validation (ADR-0111, ADR-0117)
      checkReceiptAuthorization(input.currentUser, ['receipts.manage']);

      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(new Error('Sale ID cannot be empty.'));
      }

      // 2. Locate Commercial Sale Aggregate
      const sale = await this.saleRepository.findById(saleId);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 3. Multi-Tenant Isolation
      enforceReceiptTenantIsolation(sale.tenantId, input.tenantId);

      // 4. Strict Idempotency Check (ADR-0117 Invariant 10, 11)
      const existingReceipt = await this.receiptRepository.findBySaleId(sale.id);
      if (existingReceipt) {
        // Deterministically return the existing receipt without duplicate issuance or recalculation
        return SalesApplicationResult.ok(ReceiptMapper.toDTO(existingReceipt));
      }

      // 5. Commercial Precondition: Sale must be PAID or COMPLETED (ADR-0117 Invariant 8, 9)
      if (sale.status !== SaleStatus.PAID && sale.status !== SaleStatus.COMPLETED) {
        return SalesApplicationResult.fail(
          new ReceiptIssuanceRejectedException(
            `Sale '${sale.id.value}' is in status '${sale.status}'. Receipt issuance requires PAID or COMPLETED sale.`,
          ),
        );
      }

      // 6. Tender Settlement Verification (ADR-0117 Invariant 8, 21, 22)
      const payments = await this.paymentRepository.findBySaleId(sale.id);
      if (!payments || payments.length === 0) {
        return SalesApplicationResult.fail(
          new ReceiptIssuanceRejectedException(
            `No payment records found for sale '${sale.id.value}'. Cannot issue receipt without settled payment.`,
          ),
        );
      }

      const settledPayments = payments.filter((p) => p.status === PaymentStatus.COMPLETED);
      if (settledPayments.length === 0) {
        return SalesApplicationResult.fail(
          new ReceiptIssuanceRejectedException(
            `No COMPLETED payment tenders found for sale '${sale.id.value}'. Unsettled or pending payments cannot evidence a receipt.`,
          ),
        );
      }

      const settledTotal = settledPayments.reduce(
        (sum, p) => sum.add(p.amount),
        Money.zero(sale.currency),
      );

      if (settledTotal.lessThan(sale.total)) {
        return SalesApplicationResult.fail(
          new ReceiptIssuanceRejectedException(
            `Settled payment total (${settledTotal.amount} ${settledTotal.currency}) does not cover payable sale total (${sale.total.amount} ${sale.total.currency}). Cannot issue receipt for underpaid sale.`,
          ),
        );
      }

      // 7. Resolve Client Presentation Summary (ADR-0117 Invariant 16)
      let clientSummary: ClientSummaryPayload | null = input.clientSummary ?? null;
      if (!clientSummary && sale.clientId && this.clientFacade) {
        clientSummary = await this.clientFacade.getClientSummary(sale.clientId);
      } else if (!clientSummary && sale.clientId) {
        clientSummary = {
          id: sale.clientId,
          fullName: 'Customer ' + sale.clientId,
        };
      }

      // 8. Generate Gap-Free Monotonic Receipt Number per Tenant (ADR-0117 Invariant 20)
      const year = this.clock.now().getFullYear();
      const receiptNumber = await this.receiptRepository.getNextReceiptNumber(
        sale.tenantId ?? 'default',
        year,
      );

      // 9. Instantiate Immutable Receipt Aggregate Root
      const receipt = Receipt.fromSettledSale(
        {
          id: input.receiptId,
          sale,
          payments: settledPayments,
          clientSummary,
          receiptNumber,
          saleReference: input.saleReference,
        },
        this.clock,
      );

      // 10. Atomic Persistence
      await this.receiptRepository.save(receipt);

      // 11. Domain Event Dispatching
      const events = receipt.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      receipt.clearEvents();

      return SalesApplicationResult.ok(ReceiptMapper.toDTO(receipt));
    } catch (err: unknown) {
      if (err instanceof DuplicateReceiptException) {
        const existing = await this.receiptRepository.findBySaleId(input.saleId);
        if (existing) {
          return SalesApplicationResult.ok(ReceiptMapper.toDTO(existing));
        }
      }
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
