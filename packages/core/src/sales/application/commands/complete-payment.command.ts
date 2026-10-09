import { RecordPaymentCurrentUser } from './record-payment.command';

export interface CompletePaymentInput {
  paymentId: string;
  saleId?: string;
  reference?: string | null;
  paidAt?: Date | string;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class CompletePaymentCommand {
  constructor(public readonly input: CompletePaymentInput) {}
}
