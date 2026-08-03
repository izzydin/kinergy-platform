import { DailyAgendaDTO } from '../dtos/daily-agenda.dto';
import { WeeklyAgendaDTO } from '../dtos/weekly-agenda.dto';
import { TherapistCalendarDTO } from '../dtos/therapist-calendar.dto';
import { RoomCalendarDTO } from '../dtos/room-calendar.dto';
import { ReceptionDashboardDTO } from '../dtos/reception-dashboard.dto';
import { ClientHistoryDTO } from '../dtos/client-history.dto';

/**
 * Port interface for read-model calendar projections optimized for front-desk grids and operational dashboards.
 */
export interface CalendarReadRepository {
  /** Retrieves structured daily operational agenda view */
  getDailyAgenda(date: Date, therapistId?: string, roomId?: string): Promise<DailyAgendaDTO>;

  /** Retrieves 7-day operational agenda view */
  getWeeklyAgenda(startDate: Date, therapistId?: string, roomId?: string): Promise<WeeklyAgendaDTO>;

  /** Retrieves schedule view filtered for a single therapist */
  getTherapistCalendar(
    therapistId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TherapistCalendarDTO>;

  /** Retrieves operational grid view for a single room */
  getRoomCalendar(roomId: string, startDate: Date, endDate: Date): Promise<RoomCalendarDTO>;

  /** Retrieves comprehensive front-desk reception dashboard view */
  getReceptionDashboard(date: Date): Promise<ReceptionDashboardDTO>;

  /** Retrieves historical timeline of client bookings and compliance */
  getClientHistory(clientId: string): Promise<ClientHistoryDTO>;
}
