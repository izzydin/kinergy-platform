import { CompletePaymentHandler } from './complete-payment.handler';

/**
 * Domain command handler alias for CompletePaymentHandler.
 * Maintains full backward compatibility with existing settlement pipelines.
 */
export class SettlePaymentHandler extends CompletePaymentHandler {}
