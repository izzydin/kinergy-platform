import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSummaryDTO } from '../dtos/sale.dto';

/**
 * Filter criteria justified by the Sales domain for query operations.
 * Strictly avoids unrestricted dynamic SQL generation.
 */
export interface FindSalesCriteria {
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly status?: SaleStatus | string;
  readonly sourceType?: string;
  readonly sourceReferenceId?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
}

export type SaleSortField = 'createdAt' | 'total' | 'status';
export type SaleSortDirection = 'asc' | 'desc';

export interface FindSalesSort {
  readonly field: SaleSortField;
  readonly direction: SaleSortDirection;
}

export interface FindSalesPagination {
  readonly page: number; // 1-indexed
  readonly limit: number;
}

export interface FindSalesResult {
  readonly items: readonly SaleSummaryDTO[];
  readonly total: number;
}

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
   * Resolves a paginated, filtered, and deterministically sorted collection of sales summary projections.
   * Never leaks ORM query objects or un-encapsulated dynamic SQL.
   */
  findMany?(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult>;

  /**
   * Persists a Sale aggregate (handles initial insertion, line item mutations, and status transitions).
   */
  save(sale: Sale): Promise<void>;
}

/**
 * Backward-compatible alias for SaleRepositoryPort in application handlers and services.
 */
export type SaleRepositoryInterface = SaleRepositoryPort;
