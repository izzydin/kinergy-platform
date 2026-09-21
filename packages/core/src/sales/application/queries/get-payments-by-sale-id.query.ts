import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

export interface GetPaymentsBySaleIdInput {
  saleId: string;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class GetPaymentsBySaleIdQuery {
  constructor(public readonly input: GetPaymentsBySaleIdInput) {}
}
