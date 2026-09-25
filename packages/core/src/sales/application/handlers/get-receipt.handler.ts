import { SalesQueryHandler } from '../shared/sales-query-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { GetReceiptQuery } from '../queries/get-receipt.query';
import { ReceiptDTO } from '../dtos/receipt.dto';
import { ReceiptMapper } from '../mappers/receipt.mapper';
import { ReceiptRepositoryPort } from '../ports/receipt-repository.port';
import { ReceiptNotFoundException } from '../exceptions/receipt-not-found.exception';
import {
  checkReceiptAuthorization,
  enforceReceiptTenantIsolation,
} from '../shared/receipt-authorization';

/**
 * Query handler that retrieves an immutable Receipt document by its UUID or receiptNumber.
 * Enforces permission checks (receipts.read), multi-tenant isolation, and returns a frozen DTO.
 * Codified by ADR-0111, ADR-0117, and Rule REC-05.
 */
export class GetReceiptHandler implements SalesQueryHandler<
  GetReceiptQuery,
  SalesApplicationResult<ReceiptDTO>
> {
  constructor(private readonly receiptRepository: ReceiptRepositoryPort) {}

  public async execute(query: GetReceiptQuery): Promise<SalesApplicationResult<ReceiptDTO>> {
    try {
      const { input } = query;

      // 1. Authorization: receipts.read (or higher receipts.manage / billing.read)
      checkReceiptAuthorization(input.currentUser, ['receipts.read']);

      const receiptId = input.receiptId?.trim();
      const receiptNumber = input.receiptNumber?.trim();

      if (!receiptId && !receiptNumber) {
        return SalesApplicationResult.fail(
          new Error('Either receiptId or receiptNumber must be provided to retrieve a receipt.'),
        );
      }

      // 2. Resolve Receipt by primary UUID or sequential voucher number
      let receipt = receiptId ? await this.receiptRepository.findById(receiptId) : null;
      if (!receipt && receiptNumber) {
        receipt = await this.receiptRepository.findByReceiptNumber(receiptNumber);
      }

      if (!receipt) {
        return SalesApplicationResult.fail(
          new ReceiptNotFoundException(receiptId ?? receiptNumber ?? 'unknown'),
        );
      }

      // 3. Multi-Tenant Boundary Enforcement
      enforceReceiptTenantIsolation(receipt.tenantId, input.tenantId);

      // 4. Return canonical read-only DTO
      return SalesApplicationResult.ok(ReceiptMapper.toDTO(receipt));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
