import { CalendarSlotDTO } from './calendar-slot.dto';

/**
 * Pure Read-Model DTO representing a comprehensive front-desk reception view.
 */
export interface ReceptionDashboardDTO {
  readonly date: string;
  readonly liveFeed: CalendarSlotDTO[];
  readonly pendingCheckIns: CalendarSlotDTO[];
  readonly activeInProgress: CalendarSlotDTO[];
  readonly roomUtilizationRates: Record<string, number>;
  readonly operationalAlerts: string[];
  readonly countersByStatus?: Record<string, number>;
}
