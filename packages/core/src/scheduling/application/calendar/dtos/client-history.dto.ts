import { CalendarSlotDTO } from './calendar-slot.dto';

/**
 * Pure Read-Model DTO representing a historical timeline of client bookings and attendance compliance.
 */
export interface ClientHistoryDTO {
  readonly clientId: string;
  readonly clientName?: string;
  readonly totalBookings: number;
  readonly completedCount: number;
  readonly cancelledCount: number;
  readonly noShowCount: number;
  readonly complianceRate: number;
  readonly appointments: CalendarSlotDTO[];
}
