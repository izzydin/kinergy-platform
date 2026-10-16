import { PaymentMethod } from '../../domain/enums/payment-method.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

export interface CreatePaymentCurrentUser {
  id?: string;
  userId?: string;
  email?: string;
  tenantId?: string | null;
  permissions?: string[];
  roles?: string[];
}

export interface CreatePaymentInput {
  id?: string;
  idempotencyKey?: string;
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
