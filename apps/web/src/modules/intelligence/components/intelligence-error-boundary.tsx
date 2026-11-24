import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { IntelligenceErrorState } from './intelligence-error-state';

export interface IntelligenceErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Feature-Level Error Boundary for Kynergy Intelligence.
 *
 * Catches uncaught React rendering crashes within the module, rendering
 * the accessible IntelligenceErrorState in place without crashing the outer platform shell.
 */
export class IntelligenceErrorBoundary extends Component<IntelligenceErrorBoundaryProps, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log structured diagnostic data
    console.error('Intelligence Module Caught Rendering Exception:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <IntelligenceErrorState
          title="Error en el módulo de Inteligencia"
          error={this.state.error}
          onRetry={this.handleReset}
          testId="intelligence-error-fallback"
          className="h-full"
        />
      );
    }

    return this.props.children;
  }
}
