import {
  AssignedClientsFilterParams,
  ExpiringMembershipsFilterParams,
  TrainerAttendanceFilterParams,
  TrainerSummaryFilterParams,
} from '../types';

export const trainerDashboardQueryKeys = {
  all: ['gym', 'trainer-dashboard'] as const,
  summaries: () => ['gym', 'trainer-dashboard', 'summary'] as const,
  summary: (params?: TrainerSummaryFilterParams) =>
    ['gym', 'trainer-dashboard', 'summary', params] as const,
  assignedClientsList: () => ['gym', 'trainer-dashboard', 'assigned-clients'] as const,
  assignedClients: (params?: AssignedClientsFilterParams) =>
    ['gym', 'trainer-dashboard', 'assigned-clients', params] as const,
  expiringMembershipsList: () => ['gym', 'trainer-dashboard', 'expiring-memberships'] as const,
  expiringMemberships: (params?: ExpiringMembershipsFilterParams) =>
    ['gym', 'trainer-dashboard', 'expiring-memberships', params] as const,
  attendances: () => ['gym', 'trainer-dashboard', 'attendance'] as const,
  attendance: (params?: TrainerAttendanceFilterParams) =>
    ['gym', 'trainer-dashboard', 'attendance', params] as const,
};
