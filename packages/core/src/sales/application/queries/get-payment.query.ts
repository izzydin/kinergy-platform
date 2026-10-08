import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

export interface GetPaymentInput {
  paymentId: string;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

/**
 * GetPaymentQuery requests the authoritative application DTO representation of a Payment.
 * Classified as a pure read-only QUERY without side-effects or aggregate mutations.
 */
export class GetPaymentQuery {
  constructor(public readonly input: GetPaymentInput) {}
}

export type GetPaymentByIdInput = GetPaymentInput;
export const GetPaymentByIdQuery = GetPaymentQuery;
export type GetPaymentByIdQuery = GetPaymentQuery;
