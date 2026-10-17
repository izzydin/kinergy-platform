import { z } from 'zod';

export const cancelSaleSchema = z.object({
  reason: z
    .string({ required_error: 'Cancellation reason is required' })
    .trim()
    .min(3, 'Cancellation reason must be at least 3 characters')
    .max(255, 'Cancellation reason cannot exceed 255 characters'),
});

export type CancelSaleFormData = z.infer<typeof cancelSaleSchema>;
