import { z } from 'zod';

export const createMembershipSchema = z.object({
  clientId: z.string().min(1, 'Client is required'),
  planId: z.string().min(1, 'Membership Plan is required'),
  startDate: z.string().datetime().optional(),
  assignedTrainerId: z.string().optional(),
});

export type CreateMembershipFormValues = z.infer<typeof createMembershipSchema>;

export const renewMembershipSchema = z.object({
  newPlanId: z.string().optional(),
  effectiveDate: z.string().datetime().optional(),
});

export type RenewMembershipFormValues = z.infer<typeof renewMembershipSchema>;

export const freezeMembershipSchema = z
  .object({
    startDate: z.string().datetime({ message: 'Valid start ISO date required' }),
    endDate: z.string().datetime({ message: 'Valid end ISO date required' }),
    reason: z.string().max(250).optional(),
  })
  .refine((data) => new Date(data.endDate).getTime() > new Date(data.startDate).getTime(), {
    message: 'Freeze end date must be strictly after start date',
    path: ['endDate'],
  });

export type FreezeMembershipFormValues = z.infer<typeof freezeMembershipSchema>;

export const cancelMembershipSchema = z.object({
  reason: z
    .string()
    .min(3, 'Cancellation reason must be provided (at least 3 characters)')
    .max(500),
});

export type CancelMembershipFormValues = z.infer<typeof cancelMembershipSchema>;
