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

import { getAppConfig } from '../../app/config/app-config';
import { notificationService } from '../../app/providers/notification-provider';
import { logger } from '../logger/platform-logger';
import React, { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Default Feature / Module Error Fallback Component
 * Renders in-place inside content layout region without unmounting outer Application Shell.
 */
export const DefaultModuleErrorFallback: React.FC<{
  error: Error | null;
  reset: () => void;
  name?: string;
}> = ({ error, reset, name = 'Module' }) => {
  const isDev = getAppConfig().isDev;

  return (
    <div className="p-6">
      <Card className="border-destructive/30 bg-destructive/5 shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive font-semibold text-lg">
            <span>⚠️</span>
            <span>{name} Component Failure</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            An unexpected error occurred while rendering this feature component. The outer
            application shell remains fully functional.
          </p>

          {isDev && error && (
            <details className="mt-2 rounded-md border border-border bg-background p-3 font-mono text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Developer Diagnostics ({error.name}: {error.message})
              </summary>
              <pre className="mt-2 overflow-x-auto text-[11px] leading-tight whitespace-pre-wrap">
                {error.stack}
              </pre>
            </details>
          )}

          {!isDev && (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
              <AlertTitle>Component Failure</AlertTitle>
              <AlertDescription>
                We were unable to render this section. You can retry rendering or return to the main
                dashboard.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button variant="default" size="sm" onClick={reset}>
            Retry Component
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
        </CardFooter>
      </Card>
    </div>
  );
};

/**
 * Reusable Feature / Module Error Boundary Component (`shared/ui/error-boundary.tsx`)
 *
 * Catches uncaught React rendering crashes at component or slot boundary level,
 * allowing isolated error recovery without unmounting Application Shell.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private readonly log = logger.withContext(this.props.name || 'ErrorBoundary');

  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 1. Log structured error with component stack
    this.log.error('Uncaught Rendering Exception', error, {
      boundaryName: this.props.name || 'Module',
      componentStack: errorInfo.componentStack,
    });

    // 2. Dispatch user feedback notification
    try {
      notificationService.error(
        `${this.props.name || 'Component'} encountered an unexpected rendering error.`,
      );
    } catch {
      // Prevent notification failures from interrupting fallback rendering
    }

    // 3. Trigger optional onError handler
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
      return (
        <DefaultModuleErrorFallback
          error={this.state.error}
          reset={this.resetErrorBoundary}
          name={this.props.name}
        />
      );
    }

    return this.props.children;
  }
}
