import { z } from 'zod';

/**
 * Zod schema for creating a new facility room.
 * Minimum capacity is 1, name is required and trimmed.
 */
export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Room name is required.')
    .max(100, 'Room name cannot exceed 100 characters.'),
  capacity: z
    .number({ invalid_type_error: 'Capacity must be a number.' })
    .int('Capacity must be a whole integer.')
    .min(1, 'Room capacity must be at least 1 person.')
    .max(100, 'Room capacity cannot exceed 100 people.'),
  features: z.array(z.string().trim().min(1)).default([]),
});

export type CreateRoomFormData = z.infer<typeof createRoomSchema>;

/**
 * Zod schema for editing existing room properties with optimistic concurrency version control.
 */
export const editRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Room name is required.')
    .max(100, 'Room name cannot exceed 100 characters.'),
  capacity: z
    .number({ invalid_type_error: 'Capacity must be a number.' })
    .int('Capacity must be a whole integer.')
    .min(1, 'Room capacity must be at least 1 person.')
    .max(100, 'Room capacity cannot exceed 100 people.'),
  features: z.array(z.string().trim().min(1)).default([]),
  expectedVersion: z.number().int().min(1, 'Optimistic concurrency version must be at least 1.'),
});

export type EditRoomFormData = z.infer<typeof editRoomSchema>;

/**
 * Zod schema for deactivating an active room.
 * Requires an audit explanation reason.
 */
export const deactivateRoomSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Please provide an explanation reason for deactivating this room.')
    .max(255, 'Reason cannot exceed 255 characters.'),
  expectedVersion: z.number().int().min(1),
});

export type DeactivateRoomFormData = z.infer<typeof deactivateRoomSchema>;

/**
 * Zod schema for scheduling a temporal maintenance window.
 * Requires date, start time, end time, and explanation reason.
 */
export const scheduleMaintenanceSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date in YYYY-MM-DD format is required.'),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Valid start time in HH:mm format is required.'),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Valid end time in HH:mm format is required.'),
    reason: z
      .string()
      .trim()
      .min(1, 'A maintenance explanation reason is required.')
      .max(255, 'Reason cannot exceed 255 characters.'),
    expectedVersion: z.number().int().min(1).optional(),
  })
  .refine(
    (data) => {
      return data.endTime > data.startTime;
    },
    {
      message: 'Maintenance end time must be later than start time.',
      path: ['endTime'],
    },
  );

export type ScheduleMaintenanceFormData = z.infer<typeof scheduleMaintenanceSchema>;

/**
 * Zod schema for room availability evaluation filter.
 */
export const roomAvailabilityFilterSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date in YYYY-MM-DD format is required.'),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Valid start time in HH:mm format is required.'),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Valid end time in HH:mm format is required.'),
    roomId: z.string().optional(),
    requiredCapacity: z.number().int().min(1).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'End time must be later than start time.',
    path: ['endTime'],
  });

export type RoomAvailabilityFilterData = z.infer<typeof roomAvailabilityFilterSchema>;
