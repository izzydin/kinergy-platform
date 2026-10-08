import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

export interface ListPaymentsFilter {
  readonly saleId?: string;
  readonly status?: PaymentStatus | string;
  readonly method?: PaymentMethod | string;
  readonly createdAtFrom?: Date | string;
  readonly createdAtTo?: Date | string;
  readonly paidAtFrom?: Date | string;
  readonly paidAtTo?: Date | string;

  // Common aliases for date filtering in DataTable conventions
  readonly fromDate?: Date | string;
  readonly toDate?: Date | string;
}

export interface ListPaymentsPagination {
  readonly page?: number;
  readonly limit?: number;
}

export type ListPaymentsSortField = 'createdAt' | 'paidAt' | 'amount' | 'status';
export type ListPaymentsSortDirection = 'asc' | 'desc';

export interface ListPaymentsSort {
  readonly field?: ListPaymentsSortField | string;
  readonly direction?: ListPaymentsSortDirection | string;
}

export interface ListPaymentsInput {
  readonly tenantId?: string;
  readonly currentUser?: RecordPaymentCurrentUser;

  // Nested query structures (ADR-0132 Section 4.7)
  readonly filter?: ListPaymentsFilter;
  readonly pagination?: ListPaymentsPagination;
  readonly sort?: ListPaymentsSort;

  // Flat query parameters (DataTable / REST URL state conventions)
  readonly saleId?: string;
  readonly status?: PaymentStatus | string;
  readonly method?: PaymentMethod | string;
  readonly createdAtFrom?: Date | string;
  readonly createdAtTo?: Date | string;
  readonly paidAtFrom?: Date | string;
  readonly paidAtTo?: Date | string;
  readonly fromDate?: Date | string;
  readonly toDate?: Date | string;

  readonly page?: number;
  readonly limit?: number;
  readonly pageSize?: number;

  readonly sortBy?: ListPaymentsSortField | string;
  readonly sortField?: ListPaymentsSortField | string;
  readonly sortOrder?: ListPaymentsSortDirection | string;
  readonly sortDirection?: ListPaymentsSortDirection | string;
}

/**
 * ListPaymentsQuery retrieves a paginated, filtered, and deterministically sorted
 * collection of payment DTO projections.
 * Classified as a read-only QUERY without side-effects or aggregate mutations.
 */
export class ListPaymentsQuery {
  constructor(public readonly input: ListPaymentsInput = {}) {}
}
