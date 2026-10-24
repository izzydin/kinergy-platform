import { z } from 'zod';

export const RECURRENCE_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type RecurrenceFrequencyType = (typeof RECURRENCE_FREQUENCIES)[number];

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
  // Recurrence settings
  isRecurring: z.boolean().default(false),
  frequency: z.enum(RECURRENCE_FREQUENCIES).default('WEEKLY'),
  recurrenceEndType: z.enum(['count', 'date']).default('count'),
  maxOccurrences: z
    .number()
    .int()
    .min(2, 'A recurring series requires at least 2 occurrences')
    .max(52, 'Maximum 52 occurrences per series')
    .default(12),
  recurrenceEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid end date (YYYY-MM-DD) required')
    .optional(),
});

export type AppointmentBookingFormData = z.infer<typeof appointmentBookingFormSchema>;

export const editSingleOccurrenceFormSchema = z.object({
  newDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date (YYYY-MM-DD) is required')
    .optional(),
  newTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Valid time (HH:mm) is required')
    .optional(),
  newTherapistId: z.string().optional(),
  newRoomId: z.string().optional(),
  rescheduleReason: z
    .string()
    .min(3, 'Mandatory reschedule reason (min 3 characters) is required for audit trail'),
});

export type EditSingleOccurrenceFormData = z.infer<typeof editSingleOccurrenceFormSchema>;

export const editFutureOccurrencesFormSchema = z.object({
  cutoffDate: z.string().min(1, 'Cutoff date is required'),
  fromOccurrenceIndex: z.number().int().min(0),
  newFrequency: z.enum(RECURRENCE_FREQUENCIES).optional(),
  newTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Valid time (HH:mm) is required')
    .optional(),
  newDurationMinutes: z.number().min(15).max(240).optional(),
  newTherapistId: z.string().optional(),
  newRoomId: z.string().optional(),
  newEndDate: z.string().optional(),
  newMaxOccurrences: z.number().int().min(1).max(52).optional(),
});

export type EditFutureOccurrencesFormData = z.infer<typeof editFutureOccurrencesFormSchema>;

export const skipOccurrenceFormSchema = z.object({
  reason: z.string().min(3, 'Reason for skipping this occurrence is required (min 3 characters)'),
});

export type SkipOccurrenceFormData = z.infer<typeof skipOccurrenceFormSchema>;

export const cancelSeriesFormSchema = z.object({
  reason: z.string().min(3, 'Reason for cancelling the series is required (min 3 characters)'),
});

export type CancelSeriesFormData = z.infer<typeof cancelSeriesFormSchema>;
