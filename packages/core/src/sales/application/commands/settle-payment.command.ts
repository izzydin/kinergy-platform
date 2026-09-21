import { RecordPaymentCurrentUser } from './record-payment.command';

export interface SettlePaymentInput {
  paymentId: string;
  saleId?: string;
  reference?: string | null;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class SettlePaymentCommand {
  constructor(public readonly input: SettlePaymentInput) {}
}
