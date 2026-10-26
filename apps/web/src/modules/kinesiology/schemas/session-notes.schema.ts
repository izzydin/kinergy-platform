import { z } from 'zod';

export const MAX_SECTION_LENGTH = 10000;
export const MAX_TOTAL_NOTE_LENGTH = 50000;

export const soapNotesSchema = z
  .object({
    subjective: z
      .string()
      .max(
        MAX_SECTION_LENGTH,
        `Subjective notes cannot exceed ${MAX_SECTION_LENGTH.toLocaleString('en-US')} characters.`,
      )
      .optional(),
    objective: z
      .string()
      .max(
        MAX_SECTION_LENGTH,
        `Objective findings cannot exceed ${MAX_SECTION_LENGTH.toLocaleString('en-US')} characters.`,
      )
      .optional(),
    assessment: z
      .string()
      .max(
        MAX_SECTION_LENGTH,
        `Clinical assessment cannot exceed ${MAX_SECTION_LENGTH.toLocaleString('en-US')} characters.`,
      )
      .optional(),
    plan: z
      .string()
      .max(
        MAX_SECTION_LENGTH,
        `Treatment plan cannot exceed ${MAX_SECTION_LENGTH.toLocaleString('en-US')} characters.`,
      )
      .optional(),
    rawText: z
      .string()
      .max(
        MAX_TOTAL_NOTE_LENGTH,
        `Raw observations cannot exceed ${MAX_TOTAL_NOTE_LENGTH.toLocaleString('en-US')} characters.`,
      )
      .optional(),
  })
  .refine(
    (data) => {
      const total =
        (data.subjective?.length ?? 0) +
        (data.objective?.length ?? 0) +
        (data.assessment?.length ?? 0) +
        (data.plan?.length ?? 0) +
        (data.rawText?.length ?? 0);
      return total <= MAX_TOTAL_NOTE_LENGTH;
    },
    {
      message: `Total clinical notes across all sections cannot exceed ${MAX_TOTAL_NOTE_LENGTH.toLocaleString('en-US')} characters.`,
      path: ['rawText'], // Anchor to the general or raw section so react-hook-form can display it
    },
  );

export type SoapNotesFormData = z.infer<typeof soapNotesSchema>;
