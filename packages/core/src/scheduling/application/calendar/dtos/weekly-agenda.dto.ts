import { DailyAgendaDTO } from './daily-agenda.dto';

/**
 * Pure Read-Model DTO representing a 7-day operational schedule view grouped by day and resource.
 */
export interface WeeklyAgendaDTO {
  readonly startDate: string;
  readonly endDate: string;
  readonly totalAppointments: number;
  readonly dailyAgendas: DailyAgendaDTO[];
}
