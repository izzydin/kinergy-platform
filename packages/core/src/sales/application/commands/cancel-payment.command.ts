import { RecordPaymentCurrentUser } from './record-payment.command';

export interface CancelPaymentInput {
  paymentId: string;
  reason?: string | null;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class CancelPaymentCommand {
  constructor(public readonly input: CancelPaymentInput) {}
}
