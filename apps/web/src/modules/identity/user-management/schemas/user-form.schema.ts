import { z } from 'zod';

export const userRoleEnum = z.enum(['ADMIN', 'OPERATOR', 'MEMBER']);
export const userStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED']);

export const createUserSchema = z.object({
  email: z.string().min(1, 'Email address is required').email('Invalid email address format'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters'),
  role: userRoleEnum,
  status: userStatusEnum.default('ACTIVE'),
});

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  role: userRoleEnum.optional(),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
