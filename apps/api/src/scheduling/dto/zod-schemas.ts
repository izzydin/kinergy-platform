import { z } from 'zod';
import { RecurrenceFrequency } from '@kinergy-platform/core';

export const LocalStartTimeSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const CreateRecurrenceSeriesSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  therapistId: z.string().min(1, 'therapistId is required'),
  roomId: z.string().min(1, 'roomId is required'),
  serviceType: z.string().min(1, 'serviceType is required'),
  frequency: z.nativeEnum(RecurrenceFrequency),
  startDate: z.string().min(1, 'startDate is required'),
  endDate: z.string().optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  localStartTime: LocalStartTimeSchema,
  durationMinutes: z.number().int().min(15).max(240),
  timezone: z.string().optional().default('UTC'),
  horizonDays: z.number().int().min(1).max(90).optional().default(60),
});

export const SkipOccurrenceSchema = z.object({
  occurrenceIndex: z.number().int().min(0, 'occurrenceIndex must be greater than or equal to 0'),
  reason: z.string().optional(),
});

export const EditSingleOccurrenceSchema = z.object({
  newStartTime: z.string().optional(),
  newDurationMinutes: z.number().int().min(15).max(240).optional(),
  newTherapistId: z.string().optional(),
  newRoomId: z.string().optional(),
  rescheduleReason: z.string().optional(),
});

export const EditFutureOccurrencesSchema = z.object({
  cutoffDate: z.string().min(1, 'cutoffDate is required'),
  fromOccurrenceIndex: z.number().int().min(0).optional(),
  newFrequency: z.nativeEnum(RecurrenceFrequency).optional(),
  newLocalStartTime: LocalStartTimeSchema.optional(),
  newDurationMinutes: z.number().int().min(15).max(240).optional(),
  newTherapistId: z.string().optional(),
  newRoomId: z.string().optional(),
  newEndDate: z.string().optional(),
  newMaxOccurrences: z.number().int().min(1).optional(),
  newTimezone: z.string().optional(),
  horizonDays: z.number().int().min(1).max(90).optional().default(60),
});

export const CancelRecurrenceSeriesSchema = z.object({
  reason: z.string().optional(),
});

export type CreateRecurrenceSeriesInput = z.infer<typeof CreateRecurrenceSeriesSchema>;
export type SkipOccurrenceInput = z.infer<typeof SkipOccurrenceSchema>;
export type EditSingleOccurrenceInput = z.infer<typeof EditSingleOccurrenceSchema>;
export type EditFutureOccurrencesInput = z.infer<typeof EditFutureOccurrencesSchema>;
export type CancelRecurrenceSeriesInput = z.infer<typeof CancelRecurrenceSeriesSchema>;
