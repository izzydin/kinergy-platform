import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Spinner,
} from '@kinergy-platform/ui';
import { useTodayAttendance } from '../hooks/use-attendance';
import { AccessResult, CheckInMethod } from '../types';

export const TodayAttendanceTable: React.FC = () => {
  const [page, setPage] = useState(1);
  const [resultFilter, setResultFilter] = useState<AccessResult | undefined>(undefined);
  const [methodFilter, setMethodFilter] = useState<CheckInMethod | undefined>(undefined);

  const { data, isLoading, error, isFetching } = useTodayAttendance({
    page,
    limit: 15,
    result: resultFilter,
    method: methodFilter,
  });

  const getResultBadge = (result: AccessResult) => {
    switch (result) {
      case AccessResult.GRANTED:
        return (
          <Badge
            variant="default"
            className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 font-medium"
          >
            GRANTED
          </Badge>
        );
      case AccessResult.DENIED_DUPLICATE_CHECKIN:
        return (
          <Badge
            variant="secondary"
            className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] px-2 py-0.5"
          >
            DUPLICATE
          </Badge>
        );
      case AccessResult.DENIED_EXPIRED:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
            EXPIRED
          </Badge>
        );
      case AccessResult.DENIED_FROZEN:
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-900 text-[10px] px-2 py-0.5">
            FROZEN
          </Badge>
        );
      case AccessResult.DENIED_NO_MEMBERSHIP:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
            NO PLAN
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
            {result.replace('DENIED_', '')}
          </Badge>
        );
    }
  };

  const summary = data?.dailySummary;

  return (
    <div className="space-y-4 w-full" data-testid="today-attendance-container">
      {/* Daily KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card shadow-sm border-border/70 p-3">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
            Total Scans
          </span>
          <div
            className="text-xl font-bold text-foreground mt-0.5 font-mono"
            data-testid="kpi-total-scans"
          >
            {summary ? summary.totalCheckIns : '-'}
          </div>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Granted Entries
          </span>
          <div
            className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono"
            data-testid="kpi-granted-entries"
          >
            {summary ? summary.grantedCount : '-'}
          </div>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3">
          <span className="text-[11px] font-medium text-destructive uppercase tracking-wider block">
            Security Denials
          </span>
          <div
            className="text-xl font-bold text-destructive mt-0.5 font-mono"
            data-testid="kpi-denied-attempts"
          >
            {summary ? summary.deniedCount : '-'}
          </div>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3">
          <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
            Unique Visitors
          </span>
          <div
            className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5 font-mono"
            data-testid="kpi-unique-visitors"
          >
            {summary ? summary.uniqueClientsCount : '-'}
          </div>
        </Card>
      </div>

      {/* Main Feed Card */}
      <Card className="bg-card shadow-sm border-border/80">
        <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <CardTitle className="text-sm font-semibold text-foreground">
              Today&apos;s Live Ingress Feed
            </CardTitle>
            {isFetching && <Spinner size="sm" />}
          </div>

          {/* Filter Controls */}
          <div className="flex items-center space-x-2">
            <select
              value={resultFilter ?? ''}
              onChange={(e) => {
                setResultFilter(e.target.value ? (e.target.value as AccessResult) : undefined);
                setPage(1);
              }}
              className="text-xs h-7 px-2 rounded border border-input bg-background text-foreground"
              aria-label="Filter by result"
              data-testid="filter-result-select"
            >
              <option value="">All Outcomes</option>
              <option value={AccessResult.GRANTED}>Granted Only</option>
              <option value={AccessResult.DENIED_DUPLICATE_CHECKIN}>Duplicates</option>
              <option value={AccessResult.DENIED_EXPIRED}>Expired</option>
              <option value={AccessResult.DENIED_FROZEN}>Frozen</option>
            </select>

            <select
              value={methodFilter ?? ''}
              onChange={(e) => {
                setMethodFilter(e.target.value ? (e.target.value as CheckInMethod) : undefined);
                setPage(1);
              }}
              className="text-xs h-7 px-2 rounded border border-input bg-background text-foreground"
              aria-label="Filter by method"
              data-testid="filter-method-select"
            >
              <option value="">All Methods</option>
              <option value={CheckInMethod.MANUAL_RECEPTION}>Reception</option>
              <option value={CheckInMethod.QR_CODE}>QR Code</option>
              <option value={CheckInMethod.RFID}>RFID</option>
              <option value={CheckInMethod.BARCODE}>Barcode</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
              <Spinner size="md" />
              <p className="text-xs text-muted-foreground">
                Loading today&apos;s attendance records...
              </p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-destructive">
              Failed to load attendance feed: {error.message}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No attendance records recorded for today yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-left text-xs border-collapse"
                data-testid="today-attendance-table"
              >
                <thead>
                  <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground font-medium">
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Client ID</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Access Result</th>
                    <th className="py-2.5 px-3">Gate / Point</th>
                    <th className="py-2.5 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30 font-mono">
                  {data.items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/20 transition-colors"
                      data-testid={`attendance-row-${item.id}`}
                    >
                      <td className="py-2 px-3 text-foreground whitespace-nowrap">
                        {new Date(item.checkInTime).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3 font-semibold text-primary">{item.clientId}</td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                        {item.method}
                      </td>
                      <td className="py-2 px-3">{getResultBadge(item.result)}</td>
                      <td className="py-2 px-3 text-muted-foreground">{item.gateId ?? '-'}</td>
                      <td
                        className="py-2 px-3 text-muted-foreground font-sans truncate max-w-xs"
                        title={item.notes ?? ''}
                      >
                        {item.notes ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Bar */}
          {data && data.pagination.totalPages > 1 && (
            <div className="p-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {data.pagination.page} of {data.pagination.totalPages} (
                {data.pagination.totalItems} entries)
              </span>
              <div className="flex items-center space-x-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.pagination.hasPreviousPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  data-testid="pagination-prev-btn"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="pagination-next-btn"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
