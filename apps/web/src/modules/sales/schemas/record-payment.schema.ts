import { z } from 'zod';
import { VALID_PAYMENT_METHODS, type PaymentMethod } from '../types/payments.types';

export const recordPaymentSchema = z.object({
  method: z.enum(VALID_PAYMENT_METHODS as unknown as [PaymentMethod, ...PaymentMethod[]], {
    errorMap: () => ({ message: 'Please select a valid tender method' }),
  }),
  amount: z
    .number({ invalid_type_error: 'Payment amount must be a number' })
    .positive('Payment amount must be greater than 0.00'),
  reference: z.string().trim().max(255, 'Reference cannot exceed 255 characters').optional(),
});

export type RecordPaymentFormData = z.infer<typeof recordPaymentSchema>;
