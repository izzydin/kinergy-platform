import { CompletePaymentCommand, CompletePaymentInput } from './complete-payment.command';

export type SettlePaymentInput = CompletePaymentInput;

/**
 * Domain command alias for CompletePaymentCommand to maintain full backward compatibility
 * with existing settlement routes and handlers.
 */
export class SettlePaymentCommand extends CompletePaymentCommand {}
