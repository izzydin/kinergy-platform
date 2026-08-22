import { httpClient } from '../../../../shared/api/http-client';
import {
  AssignedClientMembershipVM,
  AssignedClientsFilterParams,
  AttendanceItemDTO,
  ExpiringMembershipsFilterParams,
} from '../types';

export const trainerDashboardApi = {
  /**
   * Retrieves memberships assigned to the designated trainer.
   */
  async getAssignedClients(
    params: AssignedClientsFilterParams,
  ): Promise<AssignedClientMembershipVM[]> {
    if (!params.trainerId) {
      return [];
    }
    return httpClient.get<AssignedClientMembershipVM[]>('/api/v1/gym/memberships/assigned', {
      params: {
        trainerId: params.trainerId,
        statuses: params.statuses ? params.statuses.join(',') : undefined,
        horizonDays: params.horizonDays,
      },
    });
  },

  /**
   * Retrieves assigned memberships that are expiring within the lookahead horizon.
   */
  async getExpiringClients(
    params: ExpiringMembershipsFilterParams,
  ): Promise<AssignedClientMembershipVM[]> {
    return httpClient.get<AssignedClientMembershipVM[]>('/api/v1/gym/memberships/expiring', {
      params: {
        trainerId: params.trainerId,
        horizonDays: params.horizonDays,
      },
    });
  },

  /**
   * Retrieves today's attendance check-ins filtered to the given assigned client IDs.
   */
  async getTodayAssignedCheckIns(assignedClientIds: string[]): Promise<AttendanceItemDTO[]> {
    if (!assignedClientIds || assignedClientIds.length === 0) {
      return [];
    }
    const response = await httpClient.get<{ items: AttendanceItemDTO[] }>(
      '/api/v1/gym/attendance/today',
      {
        params: {
          assignedClientIds: assignedClientIds.join(','),
          limit: 50,
        },
      },
    );
    return response.items || [];
  },
};
