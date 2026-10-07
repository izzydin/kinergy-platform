import { CreatePaymentHandler } from './create-payment.handler';

/**
 * RecordPaymentHandler is the backward-compatible alias for CreatePaymentHandler.
 * In accordance with ADR-0133, CreatePaymentHandler represents the canonical
 * application command handler for monetary payment creation and tender recording.
 */
export class RecordPaymentHandler extends CreatePaymentHandler {}
