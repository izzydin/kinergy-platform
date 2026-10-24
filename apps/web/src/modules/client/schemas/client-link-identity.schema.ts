import { z } from 'zod';

export const clientLinkIdentitySchema = z.object({
  identityId: z
    .string()
    .trim()
    .min(1, 'Identity ID is required.')
    .max(100, 'Identity ID must not exceed 100 characters.'),
});

export type ClientLinkIdentityFormValues = z.infer<typeof clientLinkIdentitySchema>;
