import { RecordPaymentCurrentUser } from './record-payment.command';

export interface FailPaymentInput {
  paymentId: string;
  reason?: string | null;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class FailPaymentCommand {
  constructor(public readonly input: FailPaymentInput) {}
}
