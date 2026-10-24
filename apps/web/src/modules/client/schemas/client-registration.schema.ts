import { z } from 'zod';

/**
 * Standard Phone Number Regex:
 * Accepts E.164 (+ followed by 8-15 digits) or international formatted numbers with spaces/hyphens/parentheses.
 */
const PHONE_REGEX = /^\+?[1-9]\d{7,14}$/;

export function normalizePhoneNumber(phone: string, defaultCountryCode = '591'): string {
  let cleaned = (phone || '').trim().replace(/[\s().-]/g, '');
  if (!cleaned) return '';

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  } else if (!cleaned.startsWith('+')) {
    if (cleaned.length <= 8 && defaultCountryCode) {
      cleaned = '+' + defaultCountryCode + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
}

export const clientRegistrationSchema = z.object({
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
  identityId: z.string().trim().optional().or(z.literal('')),
  bypassSoftDuplicates: z.boolean().default(false),
});

export type ClientRegistrationFormData = z.input<typeof clientRegistrationSchema>;
export type ClientRegistrationOutput = z.output<typeof clientRegistrationSchema>;
