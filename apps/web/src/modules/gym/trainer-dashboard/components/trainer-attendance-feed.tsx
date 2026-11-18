import React from 'react';
import { Link } from 'react-router-dom';
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
    <Card className="border border-border bg-card shadow-sm" data-testid="trainer-attendance-feed">
      <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-primary font-bold" aria-hidden="true">
            🚪
          </span>
          <CardTitle className="text-base font-bold text-foreground">Today's Check-Ins</CardTitle>
          <Badge variant="secondary" size="sm">
            {totalVisits === 0 && grantedCount === 0
              ? '0 Check-Ins'
              : `${grantedCount} / ${Math.max(totalVisits, grantedCount)} Granted`}
          </Badge>
        </div>
        {isFetching && !isLoading && (
          <div className="flex items-center space-x-1 text-xs text-muted-foreground animate-pulse">
            <span className="inline-block w-2 h-2 rounded-full bg-primary" />
            <span>Live</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="py-6 flex items-center justify-center space-x-2 text-muted-foreground">
            <Spinner size="sm" />
            <span className="text-xs">Loading today's check-ins...</span>
          </div>
        ) : isError ? (
          <div className="py-4 text-center">
            <p className="text-xs text-destructive mb-2">Failed to load attendance feed.</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : attendanceItems.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
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
                  className="p-2.5 bg-muted/40 border border-border rounded-lg flex items-center justify-between transition-colors hover:bg-muted"
                  data-testid={`trainer-checkin-${item.id}`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <span className="text-base select-none" aria-hidden="true">
                      {isGranted ? '🟢' : '🔴'}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <Link
                          to={`/clients/${item.clientId}`}
                          className="text-xs font-bold text-foreground hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded truncate"
                        >
                          Client: {item.clientId}
                        </Link>
                        <Badge variant={isGranted ? 'default' : 'destructive'} size="sm">
                          {item.result}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {formattedTime} via {item.method}{' '}
                        {item.membershipId ? (
                          <>
                            •{' '}
                            <Link
                              to={`/gym/memberships/${item.membershipId}`}
                              className="hover:underline text-muted-foreground hover:text-foreground"
                            >
                              Mem: {item.membershipId}
                            </Link>
                          </>
                        ) : null}{' '}
                        {item.gateId ? `(${item.gateId})` : ''}
                      </p>
                    </div>
                  </div>
                  {onSelectClient && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
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
