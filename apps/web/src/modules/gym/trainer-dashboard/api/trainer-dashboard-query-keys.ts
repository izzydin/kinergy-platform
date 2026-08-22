import {
  AssignedClientsFilterParams,
  ExpiringMembershipsFilterParams,
  TrainerAttendanceFilterParams,
  TrainerSummaryFilterParams,
} from '../types';

export const trainerDashboardQueryKeys = {
  all: ['gym', 'trainer-dashboard'] as const,
  summary: (params?: TrainerSummaryFilterParams) =>
    ['gym', 'trainer-dashboard', 'summary', params] as const,
  assignedClients: (params?: AssignedClientsFilterParams) =>
    ['gym', 'trainer-dashboard', 'assigned-clients', params] as const,
  expiringMemberships: (params?: ExpiringMembershipsFilterParams) =>
    ['gym', 'trainer-dashboard', 'expiring-memberships', params] as const,
  attendance: (params?: TrainerAttendanceFilterParams) =>
    ['gym', 'trainer-dashboard', 'attendance', params] as const,
};
