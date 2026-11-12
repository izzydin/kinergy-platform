import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '../../gym/attendance/api/attendance-api';
import { inventoryApi } from '../../resources/inventory/api/inventory-api';
import { schedulingApi } from '../../scheduling/api/scheduling-api';
import { salesApi } from '../../sales/api/sales-api';
import { useAuth } from '../../../app/providers/auth-provider';
import type { InventoryProductVM } from '../../resources/inventory/types';
import type { AppointmentModel, AppointmentStatus } from '../../scheduling/types/scheduling.types';
import type { PaymentSummaryDTO, SaleSummaryDTO } from '../../sales/types';

/**
 * Authoritative Facility Timezone for Operational Business Day Aggregation.
 * Aligned with backend SystemClock('UTC') in Gym Attendance and CalendarProjectionService in Scheduling.
 */
export const OPERATIONAL_FACILITY_TIMEZONE = 'UTC';

export interface OperationalBusinessDayWindow {
  /** YYYY-MM-DD in facility timezone */
  readonly dateStr: string;
  /** Start of business day in UTC ISO-8601 (00:00:00.000Z) */
  readonly startIso: string;
  /** End of business day in UTC ISO-8601 (23:59:59.999Z) */
  readonly endIso: string;
  /** Human-readable business date label (e.g., "Thu, Nov 12, 2026") */
  readonly displayLabel: string;
}

/**
 * Computes the authoritative facility business day boundaries.
 */
export function getTodayOperationalBusinessDay(
  referenceDate: Date = new Date(),
): OperationalBusinessDayWindow {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_FACILITY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(referenceDate);
  const startIso = `${dateStr}T00:00:00.000Z`;
  const endIso = `${dateStr}T23:59:59.999Z`;

  const displayLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_FACILITY_TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateStr}T12:00:00.000Z`));

  return {
    dateStr,
    startIso,
    endIso,
    displayLabel,
  };
}

/**
 * Converts a monetary DTO or numeric major-unit amount into exact integer minor units (cents)
 * without floating-point accumulation drift.
 */
export function extractPaymentMinorUnitsCents(payment: PaymentSummaryDTO): number {
  if (
    payment.amount &&
    typeof payment.amount.cents === 'number' &&
    Number.isInteger(payment.amount.cents)
  ) {
    return payment.amount.cents;
  }

  const rawMajor =
    payment.amount && typeof payment.amount.amount === 'number'
      ? payment.amount.amount
      : typeof payment.amountValue === 'number'
        ? payment.amountValue
        : 0;

  if (!Number.isFinite(rawMajor) || rawMajor < 0) {
    return 0;
  }

  // Convert via fixed decimal string representation to avoid IEEE-754 binary float drift
  const fixed = rawMajor.toFixed(2);
  const [wholeStr = '0', fracStr = '00'] = fixed.split('.');
  const whole = parseInt(wholeStr, 10) || 0;
  const frac = parseInt(fracStr.padEnd(2, '0').slice(0, 2), 10) || 0;
  return whole * 100 + frac;
}

/**
 * Formats integer minor units (cents) into a localized currency string.
 */
export function formatMinorUnitsAsCurrency(cents: number, currency = 'USD'): string {
  const safeCents = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const sign = safeCents < 0 ? '-' : '';
  const absCents = Math.abs(safeCents);
  const dollars = Math.floor(absCents / 100);
  const remainderCents = absCents % 100;

  const formattedDollars = dollars.toLocaleString('en-US');
  const formattedCents = String(remainderCents).padStart(2, '0');
  const symbol = currency.toUpperCase() === 'USD' ? '$' : `${currency.toUpperCase()} `;

  return `${sign}${symbol}${formattedDollars}.${formattedCents}`;
}

/**
 * Maps service/appointment type codes to clean human-readable labels.
 */
export function formatAppointmentServiceType(type: string): string {
  if (!type) return 'General Session';
  const normalized = type.trim().toUpperCase();
  const labels: Record<string, string> = {
    EVALUATION: 'Initial Evaluation',
    INITIAL_EVALUATION: 'Initial Evaluation',
    TREATMENT: 'Kinesiology Treatment',
    REHABILITATION: 'Rehabilitation Session',
    SPORTS_RECOVERY: 'Sports Recovery',
    FOLLOW_UP: 'Follow-Up Assessment',
    CONSULTATION: 'Clinical Consultation',
    PERSONAL_TRAINING: 'Personal Training',
    ASSESSMENT: 'Functional Assessment',
  };
  if (labels[normalized]) {
    return labels[normalized]!;
  }
  return normalized
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Formats a UTC ISO timestamp as a readable time in the facility timezone (e.g. "10:00 AM").
 */
export function formatOperationalTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_FACILITY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export type DashboardRoleProfile = 'EXECUTIVE' | 'RECEPTIONIST' | 'TRAINER' | 'INVENTORY';

export interface DashboardAccessCapabilities {
  readonly roleProfile: DashboardRoleProfile;
  readonly roleLabel: string;
  readonly canViewGymCheckIns: boolean;
  readonly canViewLowStock: boolean;
  readonly canViewAppointments: boolean;
  readonly canViewDailySales: boolean;
  readonly canViewPendingSales: boolean;
  readonly canRegisterClient: boolean;
  readonly canCreateAppointment: boolean;
  readonly canCreateSale: boolean;
  readonly canReceiveInventory: boolean;
  readonly canRegisterCheckIn: boolean;
}

/**
 * Evaluates the current authenticated user's role profile and operational capabilities
 * for permission-gated dashboard queries, sections, and quick actions.
 */
export function useDashboardAccess(): DashboardAccessCapabilities {
  const { hasPermission, hasRole, currentUser } = useAuth();

  const isExecutive =
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER') ||
    hasPermission('*') ||
    hasPermission('*:*:*');

  const isInventoryOperator =
    !isExecutive &&
    (hasRole('KITCHEN_STAFF') ||
      (hasPermission('inventory.write') && !hasPermission('appointments.read')));

  const isTrainer =
    !isExecutive &&
    !isInventoryOperator &&
    (hasRole('TRAINER') || hasRole('THERAPIST') || hasPermission('reports.read'));

  const isReceptionist = !isExecutive && !isInventoryOperator && !isTrainer;

  let roleProfile: DashboardRoleProfile = 'EXECUTIVE';
  let roleLabel = 'Executive & Facility Operations';
  if (isInventoryOperator) {
    roleProfile = 'INVENTORY';
    roleLabel = 'Inventory & Stock Operations';
  } else if (isTrainer) {
    roleProfile = 'TRAINER';
    roleLabel = 'Clinical & Training Operations';
  } else if (isReceptionist) {
    roleProfile = 'RECEPTIONIST';
    roleLabel = 'Front Desk & Reception Operations';
  } else if (currentUser?.roles?.length) {
    roleLabel = 'Executive & Facility Operations';
  }

  const canViewGymCheckIns =
    isExecutive ||
    hasPermission('attendance.read') ||
    hasPermission('gym.attendance.read') ||
    hasPermission('clients.read');

  const canViewLowStock = isExecutive || hasPermission('inventory.read');

  const canViewAppointments = isExecutive || hasPermission('appointments.read');

  // Financial revenue metrics require explicit payment/billing read access.
  // Kitchen Staff / Inventory operators have POS creation permissions (sales.create, payments.create)
  // but do NOT hold payments.read or billing.read, keeping facility revenue totals restricted.
  const canViewDailySales =
    isExecutive ||
    hasPermission('payments.read') ||
    hasPermission('billing.read') ||
    hasPermission('billing.manage');

  const canViewPendingSales = canViewDailySales && (isExecutive || hasPermission('sales.read'));

  const canRegisterClient =
    isExecutive || hasPermission('clients.write') || hasPermission('client.write');
  const canCreateAppointment = isExecutive || hasPermission('appointments.create');
  const canCreateSale = isExecutive || hasPermission('sales.create');
  const canReceiveInventory =
    isExecutive || hasPermission('inventory.write') || hasPermission('inventory.read');
  const canRegisterCheckIn =
    isExecutive ||
    hasPermission('attendance.create') ||
    hasPermission('gym.attendance.create') ||
    hasPermission('clients.read');

  return {
    roleProfile,
    roleLabel,
    canViewGymCheckIns,
    canViewLowStock,
    canViewAppointments,
    canViewDailySales,
    canViewPendingSales,
    canRegisterClient,
    canCreateAppointment,
    canCreateSale,
    canReceiveInventory,
    canRegisterCheckIn,
  };
}

export const operationalDashboardKeys = {
  all: ['operational-dashboard'] as const,
  todayCheckIns: () => [...operationalDashboardKeys.all, 'today-check-ins'] as const,
  lowStock: () => [...operationalDashboardKeys.all, 'low-stock'] as const,
  todayAppointments: (dateStr: string) =>
    [...operationalDashboardKeys.all, 'today-appointments', dateStr] as const,
  dailySalesTotal: (dateStr: string) =>
    [...operationalDashboardKeys.all, 'daily-sales-total', dateStr] as const,
  pendingSalesFollowUp: () => [...operationalDashboardKeys.all, 'pending-sales-follow-up'] as const,
};

export interface TodayGymCheckInsMetric {
  readonly grantedCount: number;
  readonly uniqueClientsCount: number;
  readonly deniedCount: number;
  readonly totalCheckIns: number;
  readonly gymDay: string;
}

export type GymCheckInsSummary = TodayGymCheckInsMetric;

/**
 * Fetches today's gym check-in summary for the active facility business day.
 */
export function useTodayGymCheckIns() {
  const { canViewGymCheckIns } = useDashboardAccess();
  const businessDay = getTodayOperationalBusinessDay();

  return useQuery<TodayGymCheckInsMetric>({
    queryKey: operationalDashboardKeys.todayCheckIns(),
    queryFn: async ({ signal }) => {
      const response = await attendanceApi.getToday({ limit: 5 }, { signal });
      const dailySummary = response.dailySummary;
      const legacySummary = (
        response as unknown as {
          summary?: {
            grantedToday?: number;
            uniqueClientsToday?: number;
            deniedToday?: number;
            totalCheckInsToday?: number;
          };
          gymDay?: string;
        }
      ).summary;

      const grantedCount =
        dailySummary?.grantedCount ??
        legacySummary?.grantedToday ??
        (response.items ?? []).filter((i) => i.result === 'GRANTED').length;

      const deniedCount =
        dailySummary?.deniedCount ??
        legacySummary?.deniedToday ??
        (response.items ?? []).filter((i) => i.result !== 'GRANTED').length;

      const uniqueClientsCount =
        dailySummary?.uniqueClientsCount ??
        legacySummary?.uniqueClientsToday ??
        new Set((response.items ?? []).filter((i) => i.result === 'GRANTED').map((i) => i.clientId))
          .size;

      const totalCheckIns =
        dailySummary?.totalCheckIns ??
        legacySummary?.totalCheckInsToday ??
        response.pagination?.totalItems ??
        grantedCount + deniedCount;

      const gymDay =
        response.items?.[0]?.gymDay ??
        (response as unknown as { gymDay?: string }).gymDay ??
        `${businessDay.dateStr}@main(UTC)`;

      return {
        grantedCount,
        uniqueClientsCount,
        deniedCount,
        totalCheckIns,
        gymDay,
      };
    },
    enabled: canViewGymCheckIns,
    staleTime: 30_000,
  });
}

export interface LowStockAlertsMetric {
  readonly count: number;
  readonly outOfStockCount: number;
  readonly lowStockOnlyCount: number;
  readonly items: InventoryProductVM[];
}

export type LowStockAlertsSummary = LowStockAlertsMetric;

/**
 * Fetches distinct active inventory items currently at or below their reorder threshold.
 * Sorted by criticality (out-of-stock first, then lowest stock-to-threshold ratio).
 */
export function useLowStockAlerts() {
  const { canViewLowStock } = useDashboardAccess();

  return useQuery<LowStockAlertsMetric>({
    queryKey: operationalDashboardKeys.lowStock(),
    queryFn: async () => {
      const items = await inventoryApi.getLowStock();
      const activeLowStock = items.filter(
        (item) => item.status === 'ACTIVE' && item.currentStock <= item.reorderThreshold,
      );

      const sorted = [...activeLowStock].sort((a, b) => {
        if (a.isOutOfStock !== b.isOutOfStock) {
          return a.isOutOfStock ? -1 : 1;
        }
        const ratioA = a.currentStock / Math.max(1, a.reorderThreshold);
        const ratioB = b.currentStock / Math.max(1, b.reorderThreshold);
        if (ratioA !== ratioB) {
          return ratioA - ratioB;
        }
        return a.name.localeCompare(b.name);
      });

      const outOfStockCount = sorted.filter((item) => item.isOutOfStock).length;

      return {
        count: sorted.length,
        outOfStockCount,
        lowStockOnlyCount: sorted.length - outOfStockCount,
        items: sorted,
      };
    },
    enabled: canViewLowStock,
    staleTime: 30_000,
  });
}

export interface DashboardAppointmentItem {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly serviceType: string;
  readonly serviceLabel: string;
  readonly therapistId: string;
  readonly therapistName: string;
  readonly roomId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly formattedStartTime: string;
  readonly formattedEndTime: string;
  readonly durationMinutes: number;
  readonly status: AppointmentStatus;
  readonly requiresAction: boolean;
  readonly actionReason?: string;
}

export interface TodayAppointmentsStatusBreakdown {
  readonly scheduled: number;
  readonly confirmed: number;
  readonly checkedIn: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly noShow: number;
}

export interface TodayAppointmentsMetric {
  readonly dateStr: string;
  /** Active appointments for today (excludes CANCELLED) */
  readonly activeCount: number;
  /** Total appointments including cancelled */
  readonly totalCount: number;
  readonly statusBreakdown: TodayAppointmentsStatusBreakdown;
  /** Non-cancelled appointments for today ordered chronologically by startTime */
  readonly scheduleItems: DashboardAppointmentItem[];
  /** Appointments requiring immediate staff follow-up (unconfirmed SCHEDULED or waiting CHECKED_IN) */
  readonly needsAttentionItems: DashboardAppointmentItem[];
}

function mapAppointmentToDashboardItem(appt: AppointmentModel): DashboardAppointmentItem {
  const clientName =
    appt.client?.fullName ||
    appt.clientName ||
    (appt.clientId ? `Client (${appt.clientId.slice(0, 8)})` : 'Walk-in Client');

  const therapistName =
    appt.therapistName ||
    (appt.therapistId
      ? /^[0-9a-f]{8}-/i.test(appt.therapistId)
        ? `Staff (${appt.therapistId.slice(0, 8)})`
        : appt.therapistId
      : 'Unassigned');

  let requiresAction = false;
  let actionReason: string | undefined;

  if (appt.status === 'SCHEDULED') {
    requiresAction = true;
    actionReason = 'Awaiting appointment confirmation';
  } else if (appt.status === 'CHECKED_IN') {
    requiresAction = true;
    actionReason = 'Client checked in — awaiting session start';
  }

  return {
    id: appt.id,
    clientId: appt.clientId,
    clientName,
    serviceType: appt.type,
    serviceLabel: formatAppointmentServiceType(appt.type),
    therapistId: appt.therapistId,
    therapistName,
    roomId: appt.roomId,
    startTime: appt.startTime,
    endTime: appt.endTime,
    formattedStartTime: formatOperationalTime(appt.startTime),
    formattedEndTime: formatOperationalTime(appt.endTime),
    durationMinutes: appt.durationMinutes,
    status: appt.status,
    requiresAction,
    actionReason,
  };
}

/**
 * Fetches today's persisted appointments for the current facility business day.
 * Excludes cancelled appointments from the active headline count while preserving full status breakdown.
 * Never exposes clinical or SOAP notes.
 */
export function useTodayAppointments() {
  const { canViewAppointments } = useDashboardAccess();
  const businessDay = getTodayOperationalBusinessDay();

  return useQuery<TodayAppointmentsMetric>({
    queryKey: operationalDashboardKeys.todayAppointments(businessDay.dateStr),
    queryFn: async () => {
      const rawAppointments = await schedulingApi.listAppointments({
        startDate: businessDay.startIso,
        endDate: businessDay.endIso,
      });

      // Deduplicate by appointment ID and ensure startTime falls within today's business window
      const seenIds = new Set<string>();
      const startMs = new Date(businessDay.startIso).getTime();
      const endMs = new Date(businessDay.endIso).getTime();

      const uniqueTodayAppointments: AppointmentModel[] = [];
      for (const appt of rawAppointments) {
        if (!appt?.id || seenIds.has(appt.id)) continue;
        const apptStartMs = new Date(appt.startTime).getTime();
        if (apptStartMs >= startMs && apptStartMs <= endMs) {
          seenIds.add(appt.id);
          uniqueTodayAppointments.push(appt);
        }
      }

      const breakdown: {
        scheduled: number;
        confirmed: number;
        checkedIn: number;
        inProgress: number;
        completed: number;
        cancelled: number;
        noShow: number;
      } = {
        scheduled: 0,
        confirmed: 0,
        checkedIn: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
      };

      for (const appt of uniqueTodayAppointments) {
        switch (appt.status) {
          case 'SCHEDULED':
          case 'RESCHEDULED':
            breakdown.scheduled += 1;
            break;
          case 'CONFIRMED':
            breakdown.confirmed += 1;
            break;
          case 'CHECKED_IN':
            breakdown.checkedIn += 1;
            break;
          case 'IN_PROGRESS':
            breakdown.inProgress += 1;
            break;
          case 'COMPLETED':
            breakdown.completed += 1;
            break;
          case 'CANCELLED':
            breakdown.cancelled += 1;
            break;
          case 'NO_SHOW':
            breakdown.noShow += 1;
            break;
        }
      }

      const nonCancelled = uniqueTodayAppointments
        .filter((appt) => appt.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .map(mapAppointmentToDashboardItem);

      const needsAttentionItems = nonCancelled.filter((item) => item.requiresAction);

      return {
        dateStr: businessDay.dateStr,
        activeCount: nonCancelled.length,
        totalCount: uniqueTodayAppointments.length,
        statusBreakdown: breakdown,
        scheduleItems: nonCancelled,
        needsAttentionItems,
      };
    },
    enabled: canViewAppointments,
    staleTime: 30_000,
  });
}

export interface DailySalesTotalMetric {
  readonly dateStr: string;
  readonly totalCents: number;
  readonly formattedTotal: string;
  readonly currency: string;
  readonly completedPaymentsCount: number;
}

/**
 * Fetches today's collected revenue across all completed/settled payments
 * whose paidAt completion timestamp falls within the current facility business day.
 * Uses integer minor-unit (cents) arithmetic to prevent floating-point drift.
 */
export function useDailySalesTotal() {
  const { canViewDailySales } = useDashboardAccess();
  const businessDay = getTodayOperationalBusinessDay();

  return useQuery<DailySalesTotalMetric>({
    queryKey: operationalDashboardKeys.dailySalesTotal(businessDay.dateStr),
    queryFn: async () => {
      const firstPage = await salesApi.listPayments({
        status: 'COMPLETED',
        paidAtFrom: businessDay.startIso,
        paidAtTo: businessDay.endIso,
        page: 1,
        limit: 100,
        sortBy: 'paidAt',
        sortDirection: 'desc',
      });

      const allItems: PaymentSummaryDTO[] = [...(firstPage.items ?? [])];
      const totalPages = Math.min(firstPage.totalPages ?? 1, 10);

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await salesApi.listPayments({
          status: 'COMPLETED',
          paidAtFrom: businessDay.startIso,
          paidAtTo: businessDay.endIso,
          page,
          limit: 100,
          sortBy: 'paidAt',
          sortDirection: 'desc',
        });
        if (nextPage.items?.length) {
          allItems.push(...nextPage.items);
        }
      }

      const startMs = new Date(businessDay.startIso).getTime();
      const endMs = new Date(businessDay.endIso).getTime();
      const seenPaymentIds = new Set<string>();

      let totalCents = 0;
      let completedPaymentsCount = 0;
      let currency = 'USD';

      for (const payment of allItems) {
        if (!payment?.id || seenPaymentIds.has(payment.id)) continue;
        if (payment.status !== 'COMPLETED') continue;
        if (!payment.paidAt) continue;

        const paidAtMs = new Date(payment.paidAt).getTime();
        if (Number.isNaN(paidAtMs) || paidAtMs < startMs || paidAtMs > endMs) {
          continue;
        }

        seenPaymentIds.add(payment.id);
        totalCents += extractPaymentMinorUnitsCents(payment);
        completedPaymentsCount += 1;
        if (payment.amount?.currency) {
          currency = payment.amount.currency;
        }
      }

      return {
        dateStr: businessDay.dateStr,
        totalCents,
        formattedTotal: formatMinorUnitsAsCurrency(totalCents, currency),
        currency,
        completedPaymentsCount,
      };
    },
    enabled: canViewDailySales,
    staleTime: 30_000,
  });
}

export interface PendingSalesFollowUpMetric {
  readonly count: number;
  readonly items: SaleSummaryDTO[];
}

/**
 * Fetches finalized sales currently in PENDING_PAYMENT status requiring settlement follow-up.
 */
export function usePendingSalesFollowUp() {
  const { canViewPendingSales } = useDashboardAccess();

  return useQuery<PendingSalesFollowUpMetric>({
    queryKey: operationalDashboardKeys.pendingSalesFollowUp(),
    queryFn: async () => {
      const response = await salesApi.listSales({
        page: 1,
        limit: 10,
        status: 'PENDING_PAYMENT',
        sortField: 'createdAt',
        sortDirection: 'desc',
      });

      const items = (response.items ?? []).filter((sale) => sale.status === 'PENDING_PAYMENT');
      return {
        count: response.total ?? items.length,
        items,
      };
    },
    enabled: canViewPendingSales,
    staleTime: 30_000,
  });
}
