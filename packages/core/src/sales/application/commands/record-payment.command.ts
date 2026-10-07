import {
  CreatePaymentCommand,
  CreatePaymentCurrentUser,
  CreatePaymentInput,
} from './create-payment.command';

export type RecordPaymentCurrentUser = CreatePaymentCurrentUser;
export type RecordPaymentInput = CreatePaymentInput;
export { CreatePaymentCommand as RecordPaymentCommand };
