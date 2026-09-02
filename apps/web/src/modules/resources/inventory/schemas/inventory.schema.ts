import { z } from 'zod';
import { InventoryCategory, UnitOfMeasure } from '@kinergy-platform/core';

/**
 * Product Registration Form Schema
 */
export const createProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3, 'SKU must be at least 3 characters')
    .max(50, 'SKU cannot exceed 50 characters')
    .regex(
      /^[A-Z0-9_-]+$/i,
      'SKU must contain only alphanumeric characters, dashes, and underscores',
    ),
  name: z
    .string()
    .trim()
    .min(3, 'Product name must be at least 3 characters')
    .max(120, 'Product name cannot exceed 120 characters'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
  category: z.nativeEnum(InventoryCategory, {
    errorMap: () => ({ message: 'Please select a valid inventory category' }),
  }),
  unitCost: z
    .number({ invalid_type_error: 'Unit cost is required' })
    .min(0, 'Unit cost must be greater than or equal to $0.00'),
  sellingPrice: z
    .number({ invalid_type_error: 'Selling price is required' })
    .min(0, 'Selling price must be greater than or equal to $0.00'),
  quantityOnHand: z
    .number({ invalid_type_error: 'Opening stock must be an integer' })
    .int('Opening stock must be a whole number')
    .min(0, 'Opening stock cannot be negative')
    .default(0),
  reorderThreshold: z
    .number({ invalid_type_error: 'Reorder threshold must be an integer' })
    .int('Reorder threshold must be a whole number')
    .min(0, 'Reorder threshold cannot be negative')
    .default(5),
  unitOfMeasure: z
    .nativeEnum(UnitOfMeasure, {
      errorMap: () => ({ message: 'Please select a valid unit of measure' }),
    })
    .default(UnitOfMeasure.UNITS),
});

export type CreateProductFormData = z.infer<typeof createProductSchema>;

/**
 * Product Metadata Update Form Schema
 */
export const updateProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Product name must be at least 3 characters')
    .max(120, 'Product name cannot exceed 120 characters')
    .optional(),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters').optional(),
  category: z.nativeEnum(InventoryCategory).optional(),
  unitCost: z.number().min(0, 'Unit cost must be at least $0.00').optional(),
  sellingPrice: z.number().min(0, 'Selling price must be at least $0.00').optional(),
  reorderThreshold: z.number().int().min(0, 'Reorder threshold cannot be negative').optional(),
  unitOfMeasure: z.nativeEnum(UnitOfMeasure).optional(),
});

export type UpdateProductFormData = z.infer<typeof updateProductSchema>;

/**
 * Purchase / Stock Receipt Modal Form Schema
 */
export const receiveStockSchema = z.object({
  quantity: z
    .number({ invalid_type_error: 'Received quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity received must be greater than 0'),
  unitCost: z.number().min(0, 'Unit acquisition cost must be at least $0.00').optional(),
  referenceNumber: z
    .string()
    .trim()
    .min(2, 'Purchase order or invoice reference number is required')
    .max(100, 'Reference cannot exceed 100 characters'),
  notes: z.string().trim().max(255, 'Notes cannot exceed 255 characters').optional(),
});

export type ReceiveStockFormData = z.infer<typeof receiveStockSchema>;

/**
 * Retail Sale Modal Form Schema
 */
export const sellStockSchema = z.object({
  quantity: z
    .number({ invalid_type_error: 'Sold quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity sold must be greater than 0'),
  unitPrice: z.number().min(0, 'Selling price must be at least $0.00').optional(),
  referenceId: z.string().trim().max(100, 'Reference ID cannot exceed 100 characters').optional(),
  notes: z.string().trim().max(255, 'Notes cannot exceed 255 characters').optional(),
});

export type SellStockFormData = z.infer<typeof sellStockSchema>;

/**
 * Clinical Treatment Consumption Modal Form Schema
 */
export const consumeStockSchema = z.object({
  quantity: z
    .number({ invalid_type_error: 'Consumed quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity consumed must be greater than 0'),
  treatmentSessionId: z
    .string()
    .trim()
    .max(100, 'Session reference ID cannot exceed 100 characters')
    .optional(),
  notes: z.string().trim().max(255, 'Notes cannot exceed 255 characters').optional(),
});

export type ConsumeStockFormData = z.infer<typeof consumeStockSchema>;

/**
 * Damaged / Expired Inventory Scrap Modal Form Schema
 */
export const scrapStockSchema = z.object({
  quantity: z
    .number({ invalid_type_error: 'Scrap quantity is required' })
    .int('Quantity must be a whole number')
    .positive('Quantity scrapped must be greater than 0'),
  reason: z
    .string()
    .trim()
    .min(5, 'A detailed reason explaining the disposal/scrap is mandatory (min 5 chars)')
    .max(255, 'Reason cannot exceed 255 characters'),
});

export type ScrapStockFormData = z.infer<typeof scrapStockSchema>;

/**
 * Physical Count Inventory Adjustment Form Schema
 */
export const adjustStockSchema = z.object({
  deltaQuantity: z
    .number({ invalid_type_error: 'Adjustment delta is required' })
    .int('Delta quantity must be a whole number')
    .refine((val) => val !== 0, 'Adjustment delta cannot be 0 (must be positive or negative)'),
  reason: z
    .string()
    .trim()
    .min(5, 'An audit explanation describing the physical count delta is mandatory (min 5 chars)')
    .max(255, 'Reason cannot exceed 255 characters'),
});

export type AdjustStockFormData = z.infer<typeof adjustStockSchema>;
