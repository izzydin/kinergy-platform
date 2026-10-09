import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

export interface CreatePaymentCurrentUser {
  id?: string;
  userId?: string;
  email?: string;
  permissions?: string[];
  roles?: string[];
}

export interface CreatePaymentInput {
  saleId: string;
  amount?: number;
  cents?: number;
  currency?: string;
  method: PaymentMethod | string;
  status?: PaymentStatus | string;
  reference?: string | null;
  tenantId?: string;
  currentUser?: CreatePaymentCurrentUser;
}

export class CreatePaymentCommand {
  constructor(public readonly input: CreatePaymentInput) {}
}
