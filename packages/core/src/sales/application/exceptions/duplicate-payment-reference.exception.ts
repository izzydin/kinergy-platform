/**
 * Application exception thrown when attempting to record or create a payment
 * with a reference identifier that already exists for the referenced Sale.
 */
export class DuplicatePaymentReferenceException extends Error {
  constructor(reference: string, saleId: string) {
    super(
      `A payment with reference '${reference}' already exists for sale '${saleId}'. Duplicate payment references are prohibited.`,
    );
    this.name = 'DuplicatePaymentReferenceException';
  }
}

export {
  DuplicatePaymentReferenceException as PaymentReferenceAlreadyExistsException,
  DuplicatePaymentReferenceException as PaymentReferenceAlreadyExists,
};
