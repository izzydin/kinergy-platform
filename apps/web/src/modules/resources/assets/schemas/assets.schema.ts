import { z } from 'zod';
import { AssetCategory, AssetStatus, AssetCondition } from '@kinergy-platform/core';

/**
 * Physical Location Schema
 */
export const assetLocationSchema = z.object({
  facilityId: z.string().trim().min(1, 'Facility selection is required'),
  roomId: z.string().trim().max(100).optional(),
  zone: z.string().trim().max(100).optional(),
  description: z.string().trim().max(255).optional(),
});

export type AssetLocationFormData = z.infer<typeof assetLocationSchema>;

/**
 * Asset Commissioning Registration Schema
 */
export const createAssetSchema = z.object({
  assetTag: z
    .string()
    .trim()
    .min(3, 'Asset tag must be at least 3 characters')
    .max(50, 'Asset tag cannot exceed 50 characters')
    .regex(
      /^[A-Z0-9_-]+$/i,
      'Asset tag must contain only alphanumeric characters, dashes, and underscores',
    ),
  name: z
    .string()
    .trim()
    .min(2, 'Asset name must be at least 2 characters')
    .max(150, 'Asset name cannot exceed 150 characters'),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').optional(),
  category: z.nativeEnum(AssetCategory, {
    errorMap: () => ({ message: 'Please select a valid equipment category' }),
  }),
  purchaseDate: z.string().min(1, 'Purchase acquisition date is required'),
  purchaseValueAmount: z
    .number({ invalid_type_error: 'Purchase cost is required' })
    .min(0, 'Purchase cost must be greater than or equal to $0.00'),
  purchaseValueCurrency: z.string().trim().default('USD'),
  currentEstimatedValueAmount: z
    .number({ invalid_type_error: 'Estimated value must be a number' })
    .min(0, 'Estimated value must be greater than or equal to $0.00')
    .optional(),
  condition: z
    .nativeEnum(AssetCondition, {
      errorMap: () => ({ message: 'Please select a valid condition rating' }),
    })
    .default(AssetCondition.EXCELLENT),
  status: z
    .nativeEnum(AssetStatus, {
      errorMap: () => ({ message: 'Please select a valid lifecycle status' }),
    })
    .refine(
      (status) =>
        status === AssetStatus.ACTIVE ||
        status === AssetStatus.UNDER_MAINTENANCE ||
        status === AssetStatus.DAMAGED,
      {
        message:
          'Initial status must be ACTIVE, UNDER_MAINTENANCE, or DAMAGED. RETIRED and SOLD cannot be set at creation.',
      },
    )
    .default(AssetStatus.ACTIVE),
  location: assetLocationSchema,
  notes: z.string().trim().max(1000).optional(),
});

export type CreateAssetFormData = z.infer<typeof createAssetSchema>;

/**
 * Asset Descriptive Metadata Update Schema
 * (Prohibits status, condition, location, or valuation mutations per ADR-0099)
 */
export const updateAssetDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Asset name must be at least 2 characters')
    .max(150, 'Asset name cannot exceed 150 characters')
    .optional(),
  description: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(255).optional(),
});

export type UpdateAssetDetailsFormData = z.infer<typeof updateAssetDetailsSchema>;

/**
 * Asset Physical Location Relocation Schema
 */
export const transferAssetLocationSchema = z.object({
  location: assetLocationSchema,
  reason: z.string().trim().max(255).optional(),
});

export type TransferAssetLocationFormData = z.infer<typeof transferAssetLocationSchema>;

/**
 * Asset Lifecycle Status Transition Schema
 */
export const changeAssetStatusSchema = z.object({
  status: z
    .nativeEnum(AssetStatus, {
      errorMap: () => ({ message: 'Please select a valid target status' }),
    })
    .refine((s) => s !== AssetStatus.SOLD, {
      message:
        "Direct status change to 'SOLD' is prohibited. Equipment liquidation requires recording realization sale value.",
    }),
  reason: z
    .string()
    .trim()
    .min(3, 'Operational justification reason must be at least 3 characters')
    .max(255, 'Reason cannot exceed 255 characters'),
});

export type ChangeAssetStatusFormData = z.infer<typeof changeAssetStatusSchema>;

/**
 * Asset Physical Condition Re-rating Schema
 */
export const updateAssetConditionSchema = z.object({
  condition: z.nativeEnum(AssetCondition, {
    errorMap: () => ({ message: 'Please select a valid physical condition' }),
  }),
  reason: z.string().trim().max(255).optional(),
});

export type UpdateAssetConditionFormData = z.infer<typeof updateAssetConditionSchema>;

/**
 * Asset Maintenance & Servicing Work Order Schema
 */
export const recordAssetMaintenanceSchema = z.object({
  serviceDate: z.string().min(1, 'Service date is required'),
  description: z
    .string()
    .trim()
    .min(3, 'Work order description must be at least 3 characters')
    .max(500, 'Description cannot exceed 500 characters'),
  costAmount: z
    .number({ invalid_type_error: 'Direct service cost is required' })
    .min(0, 'Service cost must be greater than or equal to $0.00'),
  costCurrency: z.string().trim().default('USD'),
  performedBy: z
    .string()
    .trim()
    .min(2, 'Technician or vendor identifier must be at least 2 characters')
    .max(120, 'Technician name cannot exceed 120 characters'),
  updateConditionTo: z.nativeEnum(AssetCondition).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type RecordAssetMaintenanceFormData = z.infer<typeof recordAssetMaintenanceSchema>;

/**
 * Asset Fair Market Value Appraisal Schema
 */
export const updateAssetValuationSchema = z.object({
  estimatedValueAmount: z
    .number({ invalid_type_error: 'Estimated fair value is required' })
    .min(0, 'Estimated value must be greater than or equal to $0.00'),
  currency: z.string().trim().default('USD'),
  reason: z.string().trim().max(255).optional(),
});

export type UpdateAssetValuationFormData = z.infer<typeof updateAssetValuationSchema>;
