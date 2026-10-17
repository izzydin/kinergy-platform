import { z } from 'zod';
import { discountSchema } from './apply-discount.schema';

export const lineItemSchema = z.object({
  sourceType: z.string().trim().optional(),
  sourceId: z.string().trim().optional(),
  skuOrCode: z.string().trim().optional(),
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
    .min(0.001, 'Quantity must be at least 0.001')
    .max(999999, 'Quantity cannot exceed 999,999'),
  discount: discountSchema.optional(),
});

export const sourceReferenceSchema = z.object({
  type: z.string().trim().min(1, 'Source type is required'),
  referenceId: z.string().trim().optional(),
  referenceCode: z.string().trim().optional(),
});

export const createSaleSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code')
      .default('USD'),
    clientId: z.string().trim().optional(),
    hasSourceReference: z.boolean().default(false),
    sourceReference: sourceReferenceSchema.optional(),
    items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
    orderDiscount: discountSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.hasSourceReference) {
        return Boolean(
          data.sourceReference?.referenceId && data.sourceReference.referenceId.trim().length > 0,
        );
      }
      return true;
    },
    {
      message: 'Reference ID is required when source reference is enabled',
      path: ['sourceReference', 'referenceId'],
    },
  );

export type LineItemFormData = z.infer<typeof lineItemSchema>;
export type CreateSaleFormData = z.infer<typeof createSaleSchema>;
