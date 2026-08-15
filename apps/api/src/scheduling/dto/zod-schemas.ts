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

export const CreateRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  capacity: z.number().int().min(1).optional().default(1),
  features: z.array(z.string()).optional().default([]),
});

export const EditRoomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  features: z.array(z.string()).optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export const ActivateRoomSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
});

export const DeactivateRoomSchema = z.object({
  reason: z.string().optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

export const ScheduleMaintenanceSchema = z.object({
  startTime: z.string().min(1, 'startTime is required'),
  endTime: z.string().min(1, 'endTime is required'),
  reason: z.string().min(1, 'reason is required'),
  expectedVersion: z.number().int().min(1).optional(),
});

export const CancelMaintenanceSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
});

export const CheckRoomAvailabilitySchema = z.object({
  startTime: z.string().min(1, 'startTime is required'),
  endTime: z.string().min(1, 'endTime is required'),
  roomId: z.string().optional(),
  requiredFeatures: z.array(z.string()).optional(),
  requiredCapacity: z.number().int().min(1).optional(),
});

export const ListRoomsSchema = z.object({
  status: z.string().optional(),
  features: z.array(z.string()).optional(),
  minCapacity: z.number().int().min(1).optional(),
});

export type CreateRecurrenceSeriesInput = z.infer<typeof CreateRecurrenceSeriesSchema>;
export type SkipOccurrenceInput = z.infer<typeof SkipOccurrenceSchema>;
export type EditSingleOccurrenceInput = z.infer<typeof EditSingleOccurrenceSchema>;
export type EditFutureOccurrencesInput = z.infer<typeof EditFutureOccurrencesSchema>;
export type CancelRecurrenceSeriesInput = z.infer<typeof CancelRecurrenceSeriesSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type EditRoomInput = z.infer<typeof EditRoomSchema>;
export type ActivateRoomInput = z.infer<typeof ActivateRoomSchema>;
export type DeactivateRoomInput = z.infer<typeof DeactivateRoomSchema>;
export type ScheduleMaintenanceInput = z.infer<typeof ScheduleMaintenanceSchema>;
export type CheckRoomAvailabilityInput = z.infer<typeof CheckRoomAvailabilitySchema>;
export type ListRoomsInput = z.infer<typeof ListRoomsSchema>;
