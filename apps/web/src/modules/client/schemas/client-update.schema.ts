import { z } from 'zod';
import { normalizePhoneNumber } from './client-registration.schema';

const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export const clientUpdateSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'First name is required.')
    .max(100, 'First name must not exceed 100 characters.'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name is required.')
    .max(100, 'Last name must not exceed 100 characters.'),
  email: z
    .string()
    .trim()
    .min(1, 'Email address is required.')
    .email('Please enter a valid email address.')
    .max(255, 'Email must not exceed 255 characters.')
    .transform((val) => val.toLowerCase()),
  phone: z
    .string()
    .trim()
    .min(1, 'Phone number is required.')
    .refine(
      (val) => {
        const normalized = normalizePhoneNumber(val);
        return PHONE_REGEX.test(normalized);
      },
      {
        message:
          'Please enter a valid phone number with country code (e.g., +15551234567 or +59170012345).',
      },
    ),
  expectedVersion: z.number().int().min(1),
});

export type ClientUpdateFormValues = z.infer<typeof clientUpdateSchema>;
