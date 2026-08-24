import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Badge,
  Spinner,
  Input,
} from '@kinergy-platform/ui';
import { useClientAttendanceHistory } from '../hooks/use-gym-attendance';
import { AccessResult } from '../types';

interface ClientAttendanceHistoryDialogProps {
  readonly clientId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ClientAttendanceHistoryDialog: React.FC<ClientAttendanceHistoryDialogProps> = ({
  clientId,
  open,
  onOpenChange,
}) => {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error } = useClientAttendanceHistory(clientId ?? '', {
    page,
    limit: 10,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const getResultBadge = (result: string) => {
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
      default:
        return (
          <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
            {result.replace('DENIED_', '')}
          </Badge>
        );
    }
  };

  const stats = data?.clientStats;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        data-testid="client-attendance-history-dialog"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">
            Attendance History: {clientId}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Chronological log of facility check-ins and admission decisions.
          </DialogDescription>
        </DialogHeader>

        {/* Client Visit Statistics Summary Bar */}
        {stats && (
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">Total Facility Visits</span>
              <span
                className="font-bold text-sm text-foreground font-mono"
                data-testid="stats-total-visits"
              >
                {stats.totalVisits}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">First Visit</span>
              <span className="font-mono text-foreground">
                {stats.firstVisitAt ? new Date(stats.firstVisitAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Last Visit</span>
              <span className="font-mono text-foreground">
                {stats.lastVisitAt ? new Date(stats.lastVisitAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        )}

        {/* Date Filter Bar */}
        <div className="flex items-center gap-2 pt-1 text-xs">
          <div className="flex items-center space-x-1.5 flex-1">
            <span className="text-muted-foreground">From:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="text-xs h-7"
              data-testid="history-filter-date-from"
            />
          </div>
          <div className="flex items-center space-x-1.5 flex-1">
            <span className="text-muted-foreground">To:</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="text-xs h-7"
              data-testid="history-filter-date-to"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="text-xs h-7 px-2"
            >
              Reset
            </Button>
          )}
        </div>

        {/* Content Table */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
              <Spinner size="md" />
              <p className="text-xs text-muted-foreground">Loading attendance history...</p>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-destructive">
              Failed to load history: {error.message}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No historical check-ins recorded for this client.
            </div>
          ) : (
            <table className="w-full text-left text-xs" data-testid="client-history-table">
              <thead>
                <tr className="border-b border-border/40 bg-muted/40 text-muted-foreground font-medium">
                  <th className="py-2 px-3">Date &amp; Time</th>
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Gate</th>
                  <th className="py-2 px-3">Result</th>
                  <th className="py-2 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 font-mono">
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-muted/20"
                    data-testid={`history-row-${item.id}`}
                  >
                    <td className="py-2 px-3 text-foreground whitespace-nowrap">
                      {new Date(item.checkInTime).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{item.method}</td>
                    <td className="py-2 px-3 text-muted-foreground">{item.gateId ?? '-'}</td>
                    <td className="py-2 px-3">{getResultBadge(item.result)}</td>
                    <td className="py-2 px-3 text-muted-foreground font-sans truncate max-w-xs">
                      {item.notes ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span>
              Page {data.pagination.page} of {data.pagination.totalPages} (
              {data.pagination.totalItems} records)
            </span>
            <div className="flex items-center space-x-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={!data.pagination.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close History
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
