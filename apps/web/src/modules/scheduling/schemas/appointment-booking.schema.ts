import { z } from 'zod';

export const appointmentBookingFormSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  clientName: z.string().optional(),
  serviceType: z.string().min(1, 'Please select a service type'),
  durationMinutes: z
    .number()
    .min(15, 'Minimum duration is 15 minutes')
    .max(480, 'Maximum duration is 8 hours'),
  therapistId: z.string().min(1, 'Please select or enter a therapist'),
  roomId: z.string().min(1, 'Please select a facility room'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date (YYYY-MM-DD) is required'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Valid time (HH:mm) is required'),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});

export type AppointmentBookingFormData = z.infer<typeof appointmentBookingFormSchema>;
