import { CalendarSlotDTO } from './calendar-slot.dto';

/**
 * Pure Read-Model DTO representing an operational schedule grid for a single room.
 */
export interface RoomCalendarDTO {
  readonly roomId: string;
  readonly roomName: string;
  readonly status: 'AVAILABLE' | 'MAINTENANCE' | 'UNAVAILABLE';
  readonly capacity: number;
  readonly features: string[];
  readonly maintenanceReason?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly appointments: CalendarSlotDTO[];
}
