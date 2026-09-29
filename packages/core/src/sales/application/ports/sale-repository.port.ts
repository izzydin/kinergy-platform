import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SourceType } from '../../domain/enums/source-type.enum';

/**
 * Port interface for Sale persistence operations within the Sales bounded context.
 * Decouples domain and application logic from concrete database/ORM drivers.
 */
export interface SaleRepositoryPort {
  /**
   * Resolves a Sale aggregate by its unique domain identifier.
   */
  findById(id: SaleId | string): Promise<Sale | null>;

  /**
   * Resolves an active (non-cancelled) Sale aggregate by its originating source reference.
   * Enforces the operational single-billing invariant (e.g. at most one active Sale per TreatmentSession).
   */
  findBySourceReference?(
    sourceType: SourceType | string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null>;

  /**
   * Resolves an active (non-cancelled) Sale aggregate by its external order reference or business code.
   */
  findBySourceCode?(sourceCode: string, tenantId?: string): Promise<Sale | null>;

  /**
   * Persists a Sale aggregate (handles initial insertion, line item mutations, and status transitions).
   */
  save(sale: Sale): Promise<void>;
}

/**
 * Backward-compatible alias for SaleRepositoryPort in application handlers and services.
 */
export type SaleRepositoryInterface = SaleRepositoryPort;
