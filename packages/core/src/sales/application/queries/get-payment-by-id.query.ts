import { RecordPaymentCurrentUser } from '../commands/record-payment.command';

export interface GetPaymentByIdInput {
  paymentId: string;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class GetPaymentByIdQuery {
  constructor(public readonly input: GetPaymentByIdInput) {}
}
