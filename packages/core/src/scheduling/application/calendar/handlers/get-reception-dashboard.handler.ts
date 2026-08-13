import { QueryHandler } from '../../shared/query-handler.interface';
import { ApplicationResult } from '../../shared/application-result';
import { CalendarReadRepository } from '../repositories/calendar-read.repository';
import { ReceptionDashboardDTO } from '../dtos/reception-dashboard.dto';
import { CalendarSlotDTO } from '../dtos/calendar-slot.dto';
import { GetReceptionDashboardQuery } from '../queries/get-reception-dashboard.query';
import { AppointmentRepository } from '../../../domain/repositories/appointment.repository';
import { RoomRepository } from '../../../domain/repositories/room.repository';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { CalendarGridMapper } from '../mappers/calendar-grid.mapper';
import { Clock, SystemClock } from '../../../domain/shared/clock';

/**
 * CQRS Query Handler retrieving real-time front-desk reception operational dashboard.
 * Aggregates live counter summaries, pending check-ins, active sessions, room occupancy rates, and actionable alerts.
 */
export class GetReceptionDashboardHandler implements QueryHandler<
  GetReceptionDashboardQuery,
  ApplicationResult<ReceptionDashboardDTO>
> {
  constructor(
    private readonly calendarReadRepository?: CalendarReadRepository,
    private readonly appointmentRepository?: AppointmentRepository,
    private readonly roomRepository?: RoomRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  public async execute(
    query: GetReceptionDashboardQuery,
  ): Promise<ApplicationResult<ReceptionDashboardDTO>> {
    try {
      const { input } = query;
      const targetDate = input.date
        ? typeof input.date === 'string'
          ? new Date(input.date)
          : input.date
        : this.clock.today();

      if (isNaN(targetDate.getTime())) {
        return ApplicationResult.fail(
          'Invalid target date provided for reception dashboard query.',
        );
      }

      // Delegate to read repository if present
      if (this.calendarReadRepository) {
        const dto = await this.calendarReadRepository.getReceptionDashboard(targetDate);
        return ApplicationResult.ok(dto);
      }

      if (!this.appointmentRepository) {
        return ApplicationResult.fail(
          'AppointmentRepository is required when CalendarReadRepository is omitted.',
        );
      }

      // Compute operational day bounds using targetDate
      const year = targetDate.getUTCFullYear();
      const month = targetDate.getUTCMonth();
      const day = targetDate.getUTCDate();

      const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      const dayRange = TimeRange.create(dayStart, dayEnd);

      // Fetch all appointments for the day
      const appointments = await this.appointmentRepository.findAppointmentsByRange(dayRange);
      const rawSlots = CalendarGridMapper.mapGridSlots({
        date: targetDate,
        appointments,
      });

      const nowMs = this.clock.now().getTime();

      // Tag operational status using clock
      const liveFeed: CalendarSlotDTO[] = rawSlots.map((slot) => {
        const startMs = new Date(slot.startTime).getTime();
        const endMs = new Date(slot.endTime).getTime();

        let operationalStatus: 'PAST' | 'CURRENT_NOW' | 'UPCOMING';
        if (endMs <= nowMs) {
          operationalStatus = 'PAST';
        } else if (startMs <= nowMs && nowMs < endMs) {
          operationalStatus = 'CURRENT_NOW';
        } else {
          operationalStatus = 'UPCOMING';
        }

        return { ...slot, operationalStatus };
      });

      // Compute counters by status
      const countersByStatus: Record<string, number> = {
        SCHEDULED: 0,
        CONFIRMED: 0,
        CHECKED_IN: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 0,
        NO_SHOW: 0,
      };

      for (const slot of liveFeed) {
        countersByStatus[slot.status] = (countersByStatus[slot.status] || 0) + 1;
      }

      // Pending Check-Ins: SCHEDULED/CONFIRMED starting in <= 15 mins or past start time but not checked in
      const pendingCheckIns = liveFeed.filter((slot) => {
        if (slot.status !== 'SCHEDULED' && slot.status !== 'CONFIRMED') return false;
        const startMs = new Date(slot.startTime).getTime();
        const diffMinutes = (startMs - nowMs) / (1000 * 60);
        return diffMinutes <= 15;
      });

      // Active In-Progress / Checked-In
      const activeInProgress = liveFeed.filter(
        (slot) => slot.status === 'IN_PROGRESS' || slot.status === 'CHECKED_IN',
      );

      // Compute room utilization rates
      const roomUtilizationRates: Record<string, number> = {};
      const roomActiveCount: Record<string, number> = {};

      for (const slot of liveFeed) {
        if (slot.roomId && (slot.status === 'IN_PROGRESS' || slot.status === 'CHECKED_IN')) {
          roomActiveCount[slot.roomId] = (roomActiveCount[slot.roomId] || 0) + 1;
        }
      }

      if (this.roomRepository) {
        const rooms = await this.roomRepository.findAll();
        for (const room of rooms) {
          const count = roomActiveCount[room.id.getValue()] || 0;
          roomUtilizationRates[room.id.getValue()] = count > 0 ? 100 : 0;
        }
      } else {
        for (const rId of Object.keys(roomActiveCount)) {
          roomUtilizationRates[rId] = 100;
        }
      }

      // Generate actionable operational alerts
      const operationalAlerts: string[] = [];

      for (const pSlot of pendingCheckIns) {
        const startMs = new Date(pSlot.startTime).getTime();
        const minsLeft = Math.round((startMs - nowMs) / (1000 * 60));

        if (minsLeft < 0) {
          operationalAlerts.push(
            `Appointment ${pSlot.appointmentId} for Client ${pSlot.clientId ?? pSlot.clientName} is past start time (${Math.abs(minsLeft)} mins ago) and pending check-in.`,
          );
        } else {
          operationalAlerts.push(
            `Appointment ${pSlot.appointmentId} starting in ${minsLeft} mins needs front-desk check-in.`,
          );
        }
      }

      const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const dashboard: ReceptionDashboardDTO = {
        date: formattedDate,
        liveFeed,
        pendingCheckIns,
        activeInProgress,
        roomUtilizationRates,
        operationalAlerts,
        countersByStatus,
      };

      return ApplicationResult.ok(dashboard);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return ApplicationResult.fail(message);
    }
  }
}
