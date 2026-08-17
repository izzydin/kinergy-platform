import { z } from 'zod';

export const soapNotesSchema = z.object({
  subjective: z.string().max(10000, 'Subjective notes cannot exceed 10,000 characters.').optional(),
  objective: z
    .string()
    .max(10000, 'Objective findings cannot exceed 10,000 characters.')
    .optional(),
  assessment: z
    .string()
    .max(10000, 'Clinical assessment cannot exceed 10,000 characters.')
    .optional(),
  plan: z.string().max(10000, 'Treatment plan cannot exceed 10,000 characters.').optional(),
  rawText: z.string().max(50000, 'Raw notes cannot exceed 50,000 characters.').optional(),
});

export type SoapNotesFormData = z.infer<typeof soapNotesSchema>;
