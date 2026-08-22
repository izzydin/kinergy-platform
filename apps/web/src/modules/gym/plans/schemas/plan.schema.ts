import { z } from 'zod';

export const createPlanSchema = z.object({
  code: z
    .string()
    .min(2, 'Plan code must have at least 2 characters')
    .max(50, 'Plan code cannot exceed 50 characters')
    .regex(/^[A-Z0-9_-]+$/, 'Plan code must be uppercase alphanumeric with underscores or dashes'),
  name: z.string().min(2, 'Plan name must have at least 2 characters').max(100),
  description: z.string().max(500).optional(),
  durationInDays: z.number().int().positive('Duration must be at least 1 day'),
  priceAmount: z.number().int().min(0, 'Price must be non-negative (in cents)'),
  priceCurrency: z.string().length(3, 'Currency code must be 3 characters').default('USD'),
  visitQuota: z.number().int().positive('Visit quota must be positive').optional(),
});

export type CreatePlanFormValues = z.infer<typeof createPlanSchema>;

export const updatePricingSchema = z.object({
  priceAmount: z.number().int().min(0, 'Price must be non-negative (in cents)'),
  currency: z.string().length(3).default('USD'),
});

export type UpdatePricingFormValues = z.infer<typeof updatePricingSchema>;
