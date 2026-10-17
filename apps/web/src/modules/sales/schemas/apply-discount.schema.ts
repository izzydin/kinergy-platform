import { z } from 'zod';

export const discountSchema = z
  .object({
    type: z.enum(['PERCENTAGE', 'FIXED'], {
      errorMap: () => ({ message: 'Please select a valid discount type (PERCENTAGE or FIXED)' }),
    }),
    value: z
      .number({ invalid_type_error: 'Discount value must be a number' })
      .positive('Discount value must be greater than 0'),
    reason: z.string().trim().max(255, 'Reason cannot exceed 255 characters').optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'PERCENTAGE') {
        return data.value <= 100;
      }
      return true;
    },
    {
      message: 'Percentage discount cannot exceed 100%',
      path: ['value'],
    },
  );

export type DiscountFormData = z.infer<typeof discountSchema>;
