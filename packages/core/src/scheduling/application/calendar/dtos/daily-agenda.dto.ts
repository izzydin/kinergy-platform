import { CalendarSlotDTO } from './calendar-slot.dto';

/**
 * Pure Read-Model DTO representing a structured daily operational schedule view.
 */
export interface DailyAgendaDTO {
  readonly date: string;
  readonly totalAppointments: number;
  readonly summaryByStatus: Record<string, number>;
  readonly slots: CalendarSlotDTO[];
  readonly appointmentsByTherapist: Record<string, CalendarSlotDTO[]>;
  readonly appointmentsByRoom: Record<string, CalendarSlotDTO[]>;
}
