import React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Spinner,
} from '@kinergy-platform/ui';
import { TrainerAttendanceItemVM } from '../types';

interface TrainerAttendanceFeedProps {
  attendanceItems: TrainerAttendanceItemVM[];
  totalVisits: number;
  grantedCount: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  onSelectClient?: (clientId: string) => void;
}

export const TrainerAttendanceFeed: React.FC<TrainerAttendanceFeedProps> = ({
  attendanceItems,
  totalVisits,
  grantedCount,
  isLoading,
  isError,
  isFetching,
  onRetry,
  onSelectClient,
}) => {
  return (
    <Card className="border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
      <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-violet-500 font-bold" aria-hidden="true">
            🚪
          </span>
          <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
            Today's Check-Ins
          </CardTitle>
          <Badge variant="secondary" size="sm">
            {grantedCount} / {totalVisits} Granted
          </Badge>
        </div>
        {isFetching && !isLoading && (
          <div className="flex items-center space-x-1 text-xs text-slate-400 animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Live</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="py-6 flex items-center justify-center space-x-2 text-slate-500">
            <Spinner size="sm" />
            <span className="text-xs">Loading today's check-ins...</span>
          </div>
        ) : isError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-red-600 dark:text-red-400 mb-2">
              Failed to load attendance feed.
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : attendanceItems.length === 0 ? (
          <div className="py-6 text-center text-slate-500 dark:text-slate-400">
            <p className="text-sm font-medium">No check-ins yet today</p>
            <p className="text-xs mt-1">
              Check-ins will appear automatically when your clients scan in.
            </p>
          </div>
        ) : (
          <div
            className="space-y-2.5 max-h-96 overflow-y-auto pr-1"
            role="feed"
            aria-label="Attendance Check-in Feed"
          >
            {attendanceItems.map((item) => {
              const isGranted = item.result === 'GRANTED';
              const formattedTime = new Date(item.checkInTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-lg flex items-center justify-between transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="text-base select-none" aria-hidden="true">
                      {isGranted ? '🟢' : '🔴'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          Client: {item.clientId}
                        </span>
                        <Badge variant={isGranted ? 'default' : 'destructive'} size="sm">
                          {item.result}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {formattedTime} via {item.method} {item.gateId ? `(${item.gateId})` : ''}
                      </p>
                    </div>
                  </div>
                  {onSelectClient && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-slate-600 dark:text-slate-400 flex-shrink-0"
                      onClick={() => onSelectClient(item.clientId)}
                    >
                      Inspect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
