import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

export interface RecordPaymentCurrentUser {
  id?: string;
  permissions?: string[];
  roles?: string[];
}

export interface RecordPaymentInput {
  saleId: string;
  amount: number;
  currency?: string;
  method: PaymentMethod | string;
  status?: PaymentStatus | string;
  reference?: string | null;
  tenantId?: string;
  currentUser?: RecordPaymentCurrentUser;
}

export class RecordPaymentCommand {
  constructor(public readonly input: RecordPaymentInput) {}
}
