/**
 * Authoritative Scheduling Domain Models and Transport DTOs
 *
 * Modeled directly against the verified backend CQRS domain contracts in:
 * - packages/core/src/scheduling/domain
 * - apps/api/src/scheduling/dto
 * - docs/scheduling/milestone-4-scheduling-implementation-blueprint.md
 *
 * NOTE: Never expose Prisma persistence entities to the frontend.
 */

// -----------------------------------------------------------------------------
// 1. Appointment Domain & DTOs
// -----------------------------------------------------------------------------

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'RESCHEDULED';

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'RESCHEDULED',
] as const;

export interface AppointmentNoteModel {
  readonly id: string;
  readonly authorId: string;
  readonly content: string;
  readonly createdAt: string;
}

export interface AppointmentModel {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly type: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly startTime: string; // UTC ISO 8601 (e.g. 2026-10-24T14:00:00.000Z)
  readonly endTime: string; // UTC ISO 8601 (e.g. 2026-10-24T15:00:00.000Z)
  readonly durationMinutes: number;
  readonly cancellationReason?: string;
  readonly seriesId?: string;
  readonly occurrenceIndex?: number;
  readonly isDetachedFromSeries?: boolean;
  readonly notes?: readonly AppointmentNoteModel[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListAppointmentsParams {
  readonly startDate: string; // UTC ISO 8601 string
  readonly endDate: string; // UTC ISO 8601 string
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly status?: string;
}

export interface CreateAppointmentInputDTO {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: string;
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly notes?: string;
}

export interface RescheduleAppointmentInputDTO {
  readonly newStartTime: string; // UTC ISO 8601
  readonly newEndTime: string; // UTC ISO 8601
  readonly reason?: string;
}

export interface CancelAppointmentInputDTO {
  readonly reason: string; // Mandatory non-empty
}

export interface MarkNoShowInputDTO {
  readonly reason?: string;
}

export interface AddAppointmentNoteInputDTO {
  readonly content: string;
}

// -----------------------------------------------------------------------------
// 2. Room & Schedulable Resource Models & DTOs
// -----------------------------------------------------------------------------

export type RoomStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'MAINTENANCE';

export interface MaintenanceWindowModel {
  readonly id: string;
  readonly roomId: string;
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly reason: string;
  readonly createdAt: string;
}

export interface RoomModel {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly status: RoomStatus;
  readonly features: string[];
  readonly maintenanceReason?: string;
  readonly maintenanceWindows: MaintenanceWindowModel[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListRoomsParams {
  readonly status?: RoomStatus;
  readonly features?: string[];
  readonly minCapacity?: number;
}

export interface CreateRoomInputDTO {
  readonly name: string;
  readonly capacity: number;
  readonly features?: string[];
}

export interface EditRoomInputDTO {
  readonly name?: string;
  readonly capacity?: number;
  readonly features?: string[];
  readonly expectedVersion: number;
}

export interface ActivateRoomInputDTO {
  readonly expectedVersion: number;
}

export interface DeactivateRoomInputDTO {
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface ScheduleMaintenanceInputDTO {
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly reason: string;
  readonly expectedVersion: number;
}

export interface CheckRoomAvailabilityParams {
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly roomId?: string;
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
}

export interface RoomAvailabilityResponseDTO {
  readonly isAvailable: boolean;
  readonly reason?: string;
  readonly availableRooms?: RoomModel[];
}

// -----------------------------------------------------------------------------
// 3. Recurrence & Occurrence Exceptions DTOs
// -----------------------------------------------------------------------------

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type SeriesStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type ExceptionType = 'SKIPPED' | 'RESCHEDULED' | 'MODIFIED';

export interface RecurrencePatternDTO {
  readonly frequency: RecurrenceFrequency;
  readonly startDate: string; // UTC ISO 8601
  readonly endDate?: string; // UTC ISO 8601
  readonly maxOccurrences?: number;
  readonly localStartTime: string; // "HH:mm"
  readonly durationMinutes: number;
  readonly timezone: string;
}

export interface RecurrenceExceptionDTO {
  readonly id: string;
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly exceptionType: ExceptionType;
  readonly originalDate: string;
  readonly reason?: string;
  readonly rescheduledDate?: string;
}

export interface RecurrenceSeriesModel {
  readonly id: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly status: SeriesStatus;
  readonly pattern: RecurrencePatternDTO;
  readonly exceptions: RecurrenceExceptionDTO[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateRecurrenceSeriesInputDTO {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly frequency: RecurrenceFrequency;
  readonly startDate: string; // UTC ISO 8601
  readonly endDate?: string; // UTC ISO 8601
  readonly maxOccurrences?: number;
  readonly localStartTime: string; // "HH:mm"
  readonly durationMinutes: number;
  readonly timezone?: string;
  readonly horizonDays?: number;
}

export interface ConflictingOccurrenceDiagnostic {
  readonly occurrenceIndex: number;
  readonly timeRange: { start: string; end: string };
  readonly conflicts: Array<{ conflictType: string; message: string; conflictingEntityId: string }>;
}

export interface CreateRecurrenceSeriesResponseDTO {
  readonly series: RecurrenceSeriesModel;
  readonly initialGeneration: {
    readonly generatedCount: number;
    readonly skippedCount: number;
    readonly conflictCount: number;
    readonly existingCount: number;
    readonly conflictingOccurrences: ConflictingOccurrenceDiagnostic[];
  };
}

export interface SkipOccurrenceInputDTO {
  readonly occurrenceIndex: number;
  readonly reason?: string;
}

export interface SkipOccurrenceResponseDTO {
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly status: 'SKIPPED';
}

export interface EditSingleOccurrenceInputDTO {
  readonly newStartTime?: string; // UTC ISO 8601
  readonly newTherapistId?: string;
  readonly newRoomId?: string;
  readonly rescheduleReason?: string;
}

export interface EditFutureOccurrencesInputDTO {
  readonly cutoffDate: string; // UTC ISO 8601
  readonly fromOccurrenceIndex?: number;
  readonly newFrequency?: RecurrenceFrequency;
  readonly newLocalStartTime?: string;
  readonly newDurationMinutes?: number;
  readonly newTherapistId?: string;
  readonly newRoomId?: string;
  readonly newEndDate?: string;
  readonly newMaxOccurrences?: number;
}

export interface EditFutureOccurrencesResponseDTO {
  readonly oldSeriesId: string;
  readonly newSeries: RecurrenceSeriesModel;
  readonly initialGeneration?: unknown;
}

export interface CancelRecurrenceSeriesInputDTO {
  readonly reason?: string;
}

export interface CancelRecurrenceSeriesResponseDTO {
  readonly seriesId: string;
  readonly cancelledCount: number;
}

// -----------------------------------------------------------------------------
// 4. Availability, Live Conflicts & Calendar Projections
// -----------------------------------------------------------------------------

export interface CheckConflictInputDTO {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId: string;
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly appointmentType?: string;
  readonly excludeAppointmentId?: string;
}

export interface ConflictDiagnosticItem {
  readonly category: string;
  readonly conflictingEntityId: string;
  readonly reason: string;
}

export interface ConflictCheckResponseDTO {
  readonly hasConflict: boolean;
  readonly conflicts: ConflictDiagnosticItem[];
}

export interface FindAvailableSlotsParams {
  readonly date: string; // YYYY-MM-DD
  readonly serviceType: string;
  readonly therapistId?: string;
  readonly roomId?: string;
}

export interface AvailableSlotDTO {
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly therapistId: string;
  readonly roomId: string;
  readonly available: boolean;
  readonly score?: number;
}

export interface CalendarSlotDTO {
  readonly id: string;
  readonly startTime: string; // UTC ISO 8601
  readonly endTime: string; // UTC ISO 8601
  readonly status:
    | 'SCHEDULED'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'NO_SHOW'
    | 'BLOCKED'
    | 'VACATION'
    | 'MAINTENANCE';
  readonly appointmentId?: string;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly clientId?: string;
  readonly clientName?: string;
  readonly serviceType?: string;
  readonly isBuffered?: boolean;
  readonly hasConflict?: boolean;
  readonly overlapCount?: number;
  readonly operationalStatus?: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
}

export interface DailyAgendaDTO {
  readonly date: string;
  readonly totalAppointments: number;
  readonly summaryByStatus: Record<string, number>;
  readonly slots: CalendarSlotDTO[];
  readonly appointmentsByTherapist: Record<string, CalendarSlotDTO[]>;
  readonly appointmentsByRoom: Record<string, CalendarSlotDTO[]>;
}

export interface WeeklyAgendaDTO {
  readonly startDate: string;
  readonly endDate: string;
  readonly totalAppointments: number;
  readonly dailyAgendas: DailyAgendaDTO[];
}

export interface CalendarAgendaParams {
  readonly view: 'day' | 'week';
  readonly date: string; // YYYY-MM-DD
  readonly therapistId?: string;
  readonly roomId?: string;
}

export interface ServiceTypeOptionDTO {
  readonly type: string;
  readonly label: string;
  readonly standardDurationMinutes: number;
  readonly minDurationMinutes: number;
  readonly maxDurationMinutes: number;
}
