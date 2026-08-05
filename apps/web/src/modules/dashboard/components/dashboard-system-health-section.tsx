import React, { useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Spinner,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@kinergy-platform/ui';
import { useDashboardStatus } from '../api/dashboard-queries';

interface DashboardSystemHealthSectionProps {
  readonly simulationState: 'success' | 'loading' | 'empty' | 'error';
}

export const DashboardSystemHealthSection: React.FC<DashboardSystemHealthSectionProps> = ({
  simulationState,
}) => {
  const { data: status, isLoading } = useDashboardStatus(simulationState);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastVariant, setToastVariant] = useState<'default' | 'destructive'>('default');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleTriggerToast = (variant: 'default' | 'destructive') => {
    setToastVariant(variant);
    setToastVisible(true);
  };

  const handleRefreshState = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <ToastProvider>
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>System Health & Notification Infrastructure</CardTitle>
              <CardDescription>
                Validates Presentational Toast Notification system, Spinners, Avatars, and Theme
                tokens.
              </CardDescription>
            </div>
            {isLoading ? (
              <Spinner size="md" label="Checking system health..." />
            ) : (
              <Badge variant={status?.systemStatus === 'operational' ? 'default' : 'destructive'}>
                {status?.systemStatus ?? 'Unknown'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src="/invalid-avatar-url.png" alt="Platform Architect" />
                <AvatarFallback>PA</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-foreground text-sm">Platform Architect Operator</p>
                <p className="text-xs text-muted-foreground">
                  Context: Track A Architectural Validation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                isLoading={isRefreshing}
                loadingText="Refreshing..."
                onClick={handleRefreshState}
              >
                Refresh Status
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => handleTriggerToast('default')}>
              Trigger Info Toast
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleTriggerToast('destructive')}
            >
              Trigger Error Toast
            </Button>
          </div>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Theme Verification: Card surfaces consume semantic tokens (`bg-card`,
          `text-card-foreground`, `border-border`).
        </CardFooter>
      </Card>

      {/* Toast Notification Viewport */}
      <ToastViewport>
        {toastVisible && (
          <Toast variant={toastVariant}>
            <div className="grid gap-1">
              <ToastTitle>
                {toastVariant === 'destructive' ? 'System Warning Alert' : 'System Notification'}
              </ToastTitle>
              <ToastDescription>
                {toastVariant === 'destructive'
                  ? 'Assertive live region notification triggered for high severity advisory.'
                  : 'Polite live region notification successfully published to ToastViewport.'}
              </ToastDescription>
            </div>
            <ToastClose onClick={() => setToastVisible(false)} />
          </Toast>
        )}
      </ToastViewport>
    </ToastProvider>
  );
};
