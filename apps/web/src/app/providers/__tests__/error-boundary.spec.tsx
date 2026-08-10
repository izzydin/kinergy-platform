import '@testing-library/jest-dom';
import { LogEntry, LogSink, PlatformLogger } from '../../../shared/logger/platform-logger';
import { ErrorBoundary } from '../../../shared/ui/error-boundary';
import { notificationService } from '../notification-provider';
import { RootErrorBoundaryProvider } from '../root-error-boundary-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';

class MemorySink implements LogSink {
  public entries: LogEntry[] = [];
  log(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

const BuggyComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test Component Rendering Exception');
  }
  return <div>Component Rendered Successfully</div>;
};

const ResettableBuggyComponent: React.FC = () => {
  const [shouldThrow, setShouldThrow] = useState(true);

  if (shouldThrow) {
    return (
      <div>
        <button onClick={() => setShouldThrow(false)}>Fix Error State</button>
        <BuggyComponent shouldThrow={true} />
      </div>
    );
  }
  return <div>Component Recovered Successfully</div>;
};

describe('Step A6.6 — Error Boundary & Error Recovery Infrastructure', () => {
  let memorySink: MemorySink;

  beforeEach(() => {
    // Suppress console.error output during intentional React error boundary test throws
    jest.spyOn(console, 'error').mockImplementation(() => {});

    memorySink = new MemorySink();
    PlatformLogger.clearSinks();
    PlatformLogger.addSink(memorySink);
    PlatformLogger.setMinLevel('debug');
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
    PlatformLogger.resetMinLevel();
    PlatformLogger.clearSinks();
  });

  describe('1. Module Level Error Boundary (shared/ui/error-boundary.tsx)', () => {
    it('traps uncaught rendering exception and displays default module fallback UI', () => {
      render(
        <ErrorBoundary name="AnalyticsModule">
          <BuggyComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText('AnalyticsModule Component Failure')).toBeInTheDocument();
      expect(
        screen.getByText(/An unexpected error occurred while rendering this feature component/i),
      ).toBeInTheDocument();
    });

    it('logs structured error metadata with component stack via PlatformLogger', () => {
      render(
        <ErrorBoundary name="TelemetryModule">
          <BuggyComponent />
        </ErrorBoundary>,
      );

      expect(memorySink.entries.length).toBeGreaterThan(0);
      const errorEntry = memorySink.entries.find((e) => e.level === 'error');
      expect(errorEntry).toBeDefined();
      expect(errorEntry?.context).toBe('TelemetryModule');
      expect(errorEntry?.message).toBe('Uncaught Rendering Exception');
      expect(errorEntry?.metadata?.boundaryName).toBe('TelemetryModule');
    });

    it('dispatches error notification via notificationService when trapped', () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      render(
        <ErrorBoundary name="ClientModule">
          <BuggyComponent />
        </ErrorBoundary>,
      );

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADD',
          notification: expect.objectContaining({
            type: 'error',
            title: 'ClientModule encountered an unexpected rendering error.',
          }),
        }),
      );

      unsubscribe();
    });

    it('executes retry recovery action when Retry Component button is clicked', () => {
      const onReset = jest.fn();

      render(
        <ErrorBoundary name="RecoverableModule" onReset={onReset}>
          <ResettableBuggyComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText('RecoverableModule Component Failure')).toBeInTheDocument();

      const retryButton = screen.getByRole('button', { name: /retry component/i });
      fireEvent.click(retryButton);

      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('supports custom fallback render prop function', () => {
      render(
        <ErrorBoundary
          fallback={(error, reset) => (
            <div>
              Custom Fallback: {error.message}
              <button onClick={reset}>Reset Custom</button>
            </div>
          )}
        >
          <BuggyComponent />
        </ErrorBoundary>,
      );

      expect(
        screen.getByText('Custom Fallback: Test Component Rendering Exception'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reset custom/i })).toBeInTheDocument();
    });
  });

  describe('2. Root Level Error Boundary (app/providers/root-error-boundary-provider.tsx)', () => {
    it('traps uncaught application exception and displays system critical fallback', () => {
      render(
        <RootErrorBoundaryProvider>
          <BuggyComponent />
        </RootErrorBoundaryProvider>,
      );

      expect(screen.getByText('System Critical Exception')).toBeInTheDocument();
      expect(
        screen.getByText(/An unexpected application-level exception occurred/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /attempt session recovery/i })).toBeInTheDocument();
    });
  });

  describe('3. Nested Error Boundaries (Isolation Guarantee)', () => {
    it('nested inner module boundary catches error without triggering outer root boundary', () => {
      render(
        <RootErrorBoundaryProvider>
          <div>
            <h1>Outer Application Shell Header</h1>
            <ErrorBoundary name="NestedModule">
              <BuggyComponent />
            </ErrorBoundary>
          </div>
        </RootErrorBoundaryProvider>,
      );

      // Outer shell remains intact
      expect(screen.getByText('Outer Application Shell Header')).toBeInTheDocument();
      // Inner module shows localized failure
      expect(screen.getByText('NestedModule Component Failure')).toBeInTheDocument();
      // Root fallback is NOT shown
      expect(screen.queryByText('System Critical Exception')).not.toBeInTheDocument();
    });
  });
});
