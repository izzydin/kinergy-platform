import { z } from 'zod';

export const cancelSessionSchema = z.object({
  reason: z
    .string()
    .min(3, 'Cancellation reason must be at least 3 characters.')
    .max(500, 'Cancellation reason cannot exceed 500 characters.')
    .trim(),
});

export type CancelSessionFormData = z.infer<typeof cancelSessionSchema>;
