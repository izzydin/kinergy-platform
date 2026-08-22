import { AssignedClientsFilterParams, ExpiringMembershipsFilterParams } from '../types';

export const trainerDashboardQueryKeys = {
  all: ['gym', 'trainer-dashboard'] as const,
  assignedClients: (params?: AssignedClientsFilterParams) =>
    ['gym', 'trainer-dashboard', 'assigned-clients', params] as const,
  expiringClients: (params?: ExpiringMembershipsFilterParams) =>
    ['gym', 'trainer-dashboard', 'expiring-clients', params] as const,
  todayCheckIns: (trainerId: string, assignedClientIds?: string[]) =>
    ['gym', 'trainer-dashboard', 'today-check-ins', trainerId, assignedClientIds] as const,
};
