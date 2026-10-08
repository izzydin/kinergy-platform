import { SaleSummaryDTO } from './sale.dto';
import { PaymentDTO } from './payment.dto';

/**
 * Generic container for paginated query results across the Sales bounded context.
 * Adheres to Kinergy pagination and DataTable URL state conventions.
 */
export interface PaginatedResultDTO<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

/**
 * Strongly-typed paginated sales projection result.
 */
export type PaginatedSalesDTO = PaginatedResultDTO<SaleSummaryDTO>;

/**
 * Strongly-typed paginated payment projection result.
 */
export type PaginatedPaymentsDTO = PaginatedResultDTO<PaymentDTO>;
