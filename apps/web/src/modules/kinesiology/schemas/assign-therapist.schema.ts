import { z } from 'zod';

export const assignTherapistSchema = z.object({
  newTherapistId: z.string().min(1, 'Please select a therapist for assignment/handover.').trim(),
});

export type AssignTherapistFormData = z.infer<typeof assignTherapistSchema>;
