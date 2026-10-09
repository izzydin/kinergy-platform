import { Payment } from '../../domain/payment.aggregate';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentDTO } from '../dtos/payment.dto';

/**
 * Filter criteria justified by the Sales domain for Payment query operations.
 * Strictly avoids unrestricted dynamic SQL generation.
 */
export interface FindPaymentsCriteria {
  readonly tenantId?: string;
  readonly saleId?: string;
  readonly status?: PaymentStatus | string;
  readonly method?: PaymentMethod | string;
  readonly createdAtFrom?: Date;
  readonly createdAtTo?: Date;
  readonly paidAtFrom?: Date;
  readonly paidAtTo?: Date;
}

export type PaymentSortField = 'createdAt' | 'paidAt' | 'amount' | 'status';
export type PaymentSortDirection = 'asc' | 'desc';

export interface FindPaymentsSort {
  readonly field: PaymentSortField;
  readonly direction: PaymentSortDirection;
}

export interface FindPaymentsPagination {
  readonly page: number; // 1-indexed
  readonly limit: number;
}

export interface FindPaymentsResult {
  readonly items: readonly (PaymentDTO | Payment)[];
  readonly total: number;
}

/**
 * Port interface for Payment persistence operations within the Sales bounded context.
 * Decouples domain and application logic from concrete database/ORM drivers.
 */
export interface PaymentRepositoryPort {
  /**
   * Persists a newly created Payment aggregate.
   * Can delegate directly to save(payment) or perform initial insert.
   */
  create?(payment: Payment): Promise<void>;

  /**
   * Resolves a Payment aggregate by its unique domain identifier.
   */
  findById(id: PaymentId | string): Promise<Payment | null>;

  /**
   * Domain-oriented alias for resolving a Payment aggregate by its unique domain identifier.
   */
  getById?(id: PaymentId | string): Promise<Payment | null>;

  /**
   * Retrieves all Payment aggregates associated with a given Sale.
   */
  findBySaleId(saleId: SaleId | string): Promise<Payment[]>;

  /**
   * Domain-oriented alias for retrieving all Payment aggregates associated with a given Sale.
   */
  listBySaleId?(saleId: SaleId | string): Promise<Payment[]>;

  /**
   * Persists a Payment aggregate (handles both initial creation and lifecycle updates).
   */
  save(payment: Payment): Promise<void>;

  /**
   * Resolves a paginated, filtered, and deterministically sorted collection of payment projections.
   * Never leaks ORM query objects or un-encapsulated dynamic SQL.
   */
  findMany?(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult>;

  /**
   * Domain-oriented method for resolving a paginated, filtered, and deterministically sorted collection of payment projections.
   */
  list?(
    criteria: FindPaymentsCriteria,
    pagination: FindPaymentsPagination,
    sort: FindPaymentsSort,
  ): Promise<FindPaymentsResult>;

  /**
   * Optional transactional execution wrapper for atomic multi-step aggregate operations.
   */
  withTransaction?<T>(work: (transactionalRepo: PaymentRepositoryPort) => Promise<T>): Promise<T>;
}

/**
 * Backward-compatible alias for PaymentRepositoryPort in application handlers and services.
 */
export type PaymentRepositoryInterface = PaymentRepositoryPort;
