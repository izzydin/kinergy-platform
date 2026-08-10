import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kinergy-platform/ui';

import { getAppConfig } from '../config/app-config';
import { notificationService } from './notification-provider';
import { logger } from '../../shared/logger/platform-logger';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export interface RootErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
}

export interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Fullscreen System Critical Error Fallback Component
 */
export const DefaultRootErrorFallback: React.FC<{ error: Error | null; reset: () => void }> = ({
  error,
  reset,
}) => {
  const isDev = getAppConfig().isDev;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-lg border-destructive/40 bg-destructive/5 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 font-bold text-destructive text-xl">
            🚨
          </div>
          <CardTitle className="font-bold text-destructive text-xl">
            System Critical Exception
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground text-sm">
            An unexpected application-level exception occurred. The runtime boundary prevented the
            application process from unmounting.
          </p>

          {isDev && error && (
            <details className="mt-3 rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold text-foreground">
                Developer Diagnostics ({error.name}: {error.message})
              </summary>
              <pre className="mt-2 overflow-x-auto text-[11px] leading-tight whitespace-pre-wrap">
                {error.stack}
              </pre>
            </details>
          )}

          {!isDev && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
              <AlertTitle>Critical Application Failure</AlertTitle>
              <AlertDescription>
                A core system exception was caught. You may attempt to recover the session or return
                to the main dashboard.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-3">
          <Button variant="default" size="sm" onClick={reset}>
            Attempt Session Recovery
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = '/dashboard';
            }}
          >
            Return to Dashboard
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Hard Refresh
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export class RootErrorBoundaryProvider extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  private readonly log = logger.withContext('RootErrorBoundary');

  public override state: RootErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.log.error('Uncaught Application Exception', error, {
      componentStack: errorInfo.componentStack,
    });

    try {
      notificationService.error('System Critical Exception trapped by Root Error Boundary.');
    } catch {
      // Ignore notification failures during root boundary recovery
    }

    this.props.onError?.(error, errorInfo);
  }

  public resetErrorBoundary = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error!, this.resetErrorBoundary);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <DefaultRootErrorFallback error={this.state.error} reset={this.resetErrorBoundary} />;
    }

    return this.props.children;
  }
}
