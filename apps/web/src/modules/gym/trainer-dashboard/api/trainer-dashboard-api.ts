import { httpClient } from '../../../../shared/api/http-client';
import {
  AssignedClientsFilterParams,
  ExpiringMembershipItemVM,
  ExpiringMembershipsFilterParams,
  PaginatedAssignedClientsVM,
  TrainerAttendanceFilterParams,
  TrainerAttendanceResponseVM,
  TrainerDashboardSummaryVM,
  TrainerSummaryFilterParams,
} from '../types';

export const trainerDashboardApi = {
  /**
   * Retrieves authoritative operational summary KPIs for the Trainer Dashboard.
   */
  async getSummary(params?: TrainerSummaryFilterParams): Promise<TrainerDashboardSummaryVM> {
    return httpClient.get<TrainerDashboardSummaryVM>('/api/v1/gym/trainer-dashboard/summary', {
      params: {
        trainerId: params?.trainerId,
        horizonDays: params?.horizonDays,
        asOfDate: params?.asOfDate,
        timezone: params?.timezone,
        facilityId: params?.facilityId,
      },
    });
  },

  /**
   * Retrieves paginated & sorted memberships assigned to the designated trainer.
   */
  async getAssignedClients(
    params?: AssignedClientsFilterParams,
  ): Promise<PaginatedAssignedClientsVM> {
    return httpClient.get<PaginatedAssignedClientsVM>('/api/v1/gym/trainer-dashboard/clients', {
      params: {
        trainerId: params?.trainerId,
        statuses: params?.statuses ? params.statuses.join(',') : undefined,
        horizonDays: params?.horizonDays,
        asOfDate: params?.asOfDate,
        page: params?.page,
        limit: params?.limit,
        sortBy: params?.sortBy,
        sortOrder: params?.sortOrder,
      },
    });
  },

  /**
   * Retrieves assigned memberships that are expiring within the lookahead horizon.
   */
  async getExpiringMemberships(
    params?: ExpiringMembershipsFilterParams,
  ): Promise<{ items: ExpiringMembershipItemVM[]; total: number; horizonDays: number }> {
    return httpClient.get<{
      items: ExpiringMembershipItemVM[];
      total: number;
      horizonDays: number;
    }>('/api/v1/gym/trainer-dashboard/expiring-memberships', {
      params: {
        trainerId: params?.trainerId,
        horizonDays: params?.horizonDays,
        asOfDate: params?.asOfDate,
      },
    });
  },

  /**
   * Retrieves today's attendance check-ins filtered to the trainer's assigned clients.
   */
  async getAttendance(
    params?: TrainerAttendanceFilterParams,
  ): Promise<TrainerAttendanceResponseVM> {
    return httpClient.get<TrainerAttendanceResponseVM>('/api/v1/gym/trainer-dashboard/attendance', {
      params: {
        trainerId: params?.trainerId,
        date: params?.date,
        facilityId: params?.facilityId,
        timezone: params?.timezone,
        page: params?.page,
        limit: params?.limit,
      },
    });
  },
};
