import { RecordPaymentCurrentUser } from './record-payment.command';

export interface CoordinateSalePaymentInput {
  saleId: string;
  paymentId: string;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class CoordinateSalePaymentCommand {
  constructor(public readonly input: CoordinateSalePaymentInput) {}
}
