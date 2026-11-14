import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from '@kinergy-platform/ui';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  ArrowRight,
  Plus,
  RefreshCw,
  CalendarCheck,
} from 'lucide-react';
import {
  useDashboardAccess,
  useTodayAppointments,
  getTodayOperationalBusinessDay,
  type DashboardAppointmentItem,
} from '../api/operational-dashboard-queries';
import type { AppointmentStatus } from '../../scheduling/types/scheduling.types';
import { useTranslation } from '../../../app/providers/locale-provider';

const MAX_VISIBLE_SCHEDULE_ITEMS = 8;

function getAppointmentStatusBadge(status: AppointmentStatus): {
  label: string;
  variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline';
} {
  switch (status) {
    case 'IN_PROGRESS':
      return { label: 'In Progress', variant: 'info' };
    case 'CHECKED_IN':
      return { label: 'Checked In', variant: 'warning' };
    case 'CONFIRMED':
      return { label: 'Confirmed', variant: 'success' };
    case 'SCHEDULED':
    case 'RESCHEDULED':
      return { label: 'Scheduled', variant: 'secondary' };
    case 'COMPLETED':
      return { label: 'Completed', variant: 'outline' };
    case 'NO_SHOW':
      return { label: 'No Show', variant: 'destructive' };
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'destructive' };
    default:
      return { label: status, variant: 'secondary' };
  }
}

export const DashboardTodaysSchedule: React.FC = () => {
  const { canViewAppointments, canCreateAppointment } = useDashboardAccess();
  const { data, isLoading, isError, refetch } = useTodayAppointments();
  const businessDay = getTodayOperationalBusinessDay();
  const { locale, t } = useTranslation();

  if (!canViewAppointments) {
    return null;
  }

  const scheduleItems: DashboardAppointmentItem[] = data?.scheduleItems ?? [];
  const visibleItems = scheduleItems.slice(0, MAX_VISIBLE_SCHEDULE_ITEMS);
  const remainingCount = Math.max(0, scheduleItems.length - visibleItems.length);

  return (
    <Card className="border-border flex flex-col" data-testid="dashboard-todays-schedule">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-border/60">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
            <span>
              {locale === 'es' ? t('dashboard.schedule.title', 'Citas de hoy') : "Today's Schedule"}
            </span>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {locale === 'es'
              ? `Agenda cronológica clínica y de entrenamiento para ${businessDay.displayLabel} (UTC)`
              : `Chronological clinic and training appointments for ${businessDay.displayLabel} (UTC)`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreateAppointment && (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/scheduling/book" data-testid="schedule-book-appointment-link">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {locale === 'es'
                    ? t('dashboard.schedule.bookNew', 'Agendar cita')
                    : 'Book Appointment'}
                </span>
              </Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs gap-1">
            <Link to="/scheduling" data-testid="schedule-open-calendar-link">
              <span>
                {locale === 'es'
                  ? t('dashboard.schedule.viewCalendar', 'Abrir calendario')
                  : 'Full Calendar'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 flex-1">
        {isLoading ? (
          <div className="space-y-3" data-testid="todays-schedule-loading">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20 animate-pulse"
              >
                <div className="space-y-2">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-3 w-56 bg-muted rounded" />
                </div>
                <div className="h-5 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-lg border border-destructive/30 bg-destructive/5"
            data-testid="todays-schedule-error"
          >
            <p className="text-sm font-medium text-destructive">
              {locale === 'es'
                ? 'No se pudo cargar la agenda de citas de hoy'
                : "Unable to load today's appointment schedule"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              {locale === 'es'
                ? 'Verifica tu conexión e intenta cargar la agenda diaria nuevamente.'
                : 'Please verify your connection and retry loading the daily agenda.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{locale === 'es' ? 'Reintentar agenda' : 'Retry Schedule'}</span>
            </Button>
          </div>
        ) : visibleItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center text-center py-8 px-4 rounded-lg border border-dashed border-border bg-muted/10"
            data-testid="todays-schedule-empty"
          >
            <div className="p-2.5 rounded-full bg-primary/10 text-primary mb-2.5">
              <CalendarCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {locale === 'es'
                ? t('dashboard.schedule.emptyTitle', 'No hay citas programadas para hoy')
                : 'No appointments scheduled for today'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {locale === 'es'
                ? `No hay citas activas reservadas para ${businessDay.displayLabel}.`
                : `There are no active appointments booked for ${businessDay.displayLabel}.`}
            </p>
            {canCreateAppointment && (
              <Button asChild variant="outline" size="sm" className="mt-3 h-8 text-xs gap-1.5">
                <Link to="/scheduling/book">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{locale === 'es' ? 'Agendar nueva cita' : 'Schedule New Appointment'}</span>
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5" data-testid="todays-schedule-list">
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {visibleItems.map((item) => {
                const statusBadge = getAppointmentStatusBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-card hover:bg-muted/30 transition-colors"
                    data-testid={`schedule-item-${item.id}`}
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="flex flex-col items-start shrink-0 min-w-[96px] text-xs font-medium text-foreground bg-muted/50 px-2.5 py-1.5 rounded border border-border/60">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
                          <span>{item.formattedStartTime}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground pl-4">
                          {item.durationMinutes} min
                        </span>
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/clients/${encodeURIComponent(item.clientId)}`}
                            className="text-sm font-semibold text-foreground hover:text-primary hover:underline truncate inline-flex items-center gap-1"
                            data-testid="schedule-item-client-name"
                          >
                            <User
                              className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                              aria-hidden="true"
                            />
                            <span>{item.clientName}</span>
                          </Link>
                          <span className="text-xs font-medium text-primary">
                            · {item.serviceLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span
                            className="inline-flex items-center gap-1"
                            data-testid="schedule-item-staff-name"
                          >
                            <Stethoscope className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>
                              {locale === 'es' ? 'Personal:' : 'Staff:'} {item.therapistName}
                            </span>
                          </span>
                          {item.roomId && (
                            <span>
                              · {locale === 'es' ? 'Sala:' : 'Room:'} {item.roomId}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0">
                      <Badge
                        variant={statusBadge.variant}
                        className="text-[11px] font-medium"
                        data-testid="schedule-item-status"
                      >
                        {locale === 'es'
                          ? t(statusBadge.label, statusBadge.label)
                          : statusBadge.label}
                      </Badge>
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <Link to="/scheduling">
                          {locale === 'es' ? t('common.view', 'Ver') : 'View'}
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {remainingCount > 0 && (
              <div className="flex items-center justify-between pt-1 px-1 text-xs text-muted-foreground">
                <span>
                  Showing {visibleItems.length} of {scheduleItems.length} active appointments today
                </span>
                <Link
                  to="/scheduling"
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  View all ({scheduleItems.length}){' '}
                  <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
