import { z } from 'zod';
import { discountSchema } from './apply-discount.schema';

export const lineItemSchema = z.object({
  sourceType: z.string().trim().min(1, 'Source type is required'),
  sourceId: z.string().trim().min(1, 'Source ID is required'),
  description: z
    .string()
    .trim()
    .min(1, 'Item description is required')
    .max(255, 'Description cannot exceed 255 characters'),
  unitPrice: z
    .number({ invalid_type_error: 'Unit price must be a number' })
    .min(0, 'Unit price cannot be negative'),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1'),
  discount: discountSchema.optional(),
});

export const createSaleSchema = z.object({
  currency: z.string().trim().length(3, 'Currency must be a 3-letter ISO code').default('USD'),
  clientId: z.string().trim().optional(),
  sourceReference: z
    .object({
      type: z.string().trim().min(1, 'Source type is required'),
      referenceId: z.string().trim().min(1, 'Reference ID is required'),
      referenceCode: z.string().trim().optional(),
    })
    .optional(),
  items: z.array(lineItemSchema).default([]),
  orderDiscount: discountSchema.optional(),
});

export type LineItemFormData = z.infer<typeof lineItemSchema>;
export type CreateSaleFormData = z.infer<typeof createSaleSchema>;
