import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntelligenceLoadingState } from '../components/intelligence-loading-state';
import {
  IntelligenceErrorState,
  sanitizeIntelligenceErrorMessage,
} from '../components/intelligence-error-state';
import { IntelligenceEmptyState } from '../components/intelligence-empty-state';
import { IntelligenceErrorBoundary } from '../components/intelligence-error-boundary';
import { IntelligenceLayout } from '../components/intelligence-layout';

// Mock AuthProvider for layout RBAC testing
const mockUseOptionalAuth = jest.fn();
jest.mock('../../../app/providers/auth-provider', () => ({
  useOptionalAuth: () => mockUseOptionalAuth(),
}));

describe('AI-09.10-IT.03 — Async & Failure Lifecycle Component Specification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOptionalAuth.mockReturnValue({
      currentUser: { id: 'usr_admin', roles: ['SUPER_ADMIN'] },
      hasRole: (r: string) => r === 'SUPER_ADMIN',
    });
  });

  describe('1. IntelligenceLoadingState (WCAG 2.2 AA Status Announcement)', () => {
    it('renders with role="status", aria-busy="true", and polite screen reader announcement', () => {
      render(
        <IntelligenceLoadingState
          variant="page"
          message="Cargando espacio de trabajo de Inteligencia..."
        />,
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute('aria-busy', 'true');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(
        screen.getByText('Cargando espacio de trabajo de Inteligencia...'),
      ).toBeInTheDocument();
    });

    it('supports multiple skeleton variants without DOM errors', () => {
      const { rerender } = render(<IntelligenceLoadingState variant="chat" />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<IntelligenceLoadingState variant="knowledge" />);
      expect(screen.getByRole('status')).toBeInTheDocument();

      rerender(<IntelligenceLoadingState variant="conversation-list" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('2. IntelligenceErrorState & Secret Sanitization', () => {
    it('renders role="alert" with title, correlation ID, and retry button', () => {
      const handleRetry = jest.fn();
      render(
        <IntelligenceErrorState
          title="Fallo al recuperar el historial"
          error="Tiempo de espera agotado"
          correlationId="req_trace_98765"
          onRetry={handleRetry}
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Fallo al recuperar el historial')).toBeInTheDocument();
      expect(screen.getByText('Tiempo de espera agotado')).toBeInTheDocument();
      expect(screen.getByText(/req_trace_98765/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('sanitizes technical Prisma, SQL, and database connection errors to protect system secrets', () => {
      const rawPrismaError = new Error(
        'PrismaClientKnownRequestError: Invalid `prisma.conversation.findUnique()` invocation: database connection refused at 10.0.0.1:5432',
      );

      const sanitizedMessage = sanitizeIntelligenceErrorMessage(rawPrismaError);
      expect(sanitizedMessage).toBe(
        'El servicio de Inteligencia experimentó un inconveniente temporal. Intenta nuevamente en unos instantes.',
      );
      expect(sanitizedMessage).not.toContain('PrismaClientKnownRequestError');
      expect(sanitizedMessage).not.toContain('10.0.0.1:5432');

      const rawSqlError = 'Fatal: SQL syntax error in SELECT * FROM ai_conversations';
      const sanitizedSql = sanitizeIntelligenceErrorMessage(rawSqlError);
      expect(sanitizedSql).not.toContain('SELECT');
      expect(sanitizedSql).not.toContain('ai_conversations');
    });
  });

  describe('3. IntelligenceEmptyState Behavioral Presentation', () => {
    it('renders empty headline, guidance text, and interactive action CTA', () => {
      const handleAction = jest.fn();
      render(
        <IntelligenceEmptyState
          title="Sin documentos en la biblioteca"
          description="Sube guías clínicas para comenzar a realizar preguntas fundamentadas."
          action={
            <button type="button" onClick={handleAction}>
              Subir guía clínica
            </button>
          }
        />,
      );

      expect(screen.getByText('Sin documentos en la biblioteca')).toBeInTheDocument();
      expect(
        screen.getByText('Sube guías clínicas para comenzar a realizar preguntas fundamentadas.'),
      ).toBeInTheDocument();

      const actionBtn = screen.getByRole('button', { name: /subir guía clínica/i });
      fireEvent.click(actionBtn);
      expect(handleAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. IntelligenceErrorBoundary Rendering Containment', () => {
    // Suppress expected console.error during deliberate error throwing in tests
    const originalConsoleError = console.error;
    beforeAll(() => {
      console.error = jest.fn();
    });
    afterAll(() => {
      console.error = originalConsoleError;
    });

    const ThrowingComponent = () => {
      throw new Error('Simulated Crash inside Assistant Workspace');
    };

    it('catches render exceptions, displays fallback error state, and executes reset on retry', () => {
      const handleReset = jest.fn();

      render(
        <IntelligenceErrorBoundary onReset={handleReset}>
          <ThrowingComponent />
        </IntelligenceErrorBoundary>,
      );

      expect(screen.getByTestId('intelligence-error-fallback')).toBeInTheDocument();
      expect(screen.getByText('Error en el módulo de Inteligencia')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /reintentar/i });
      fireEvent.click(retryBtn);

      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('5. IntelligenceLayout Landmark & RBAC Navigation Gating', () => {
    it('renders semantic landmarks and accessible skip to content link (WCAG 2.4.1)', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence']}>
          <IntelligenceLayout>
            <div data-testid="layout-child-content">Contenido de prueba</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('region', { name: /espacio de trabajo kynergy intelligence/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', { name: /secciones de inteligencia/i }),
      ).toBeInTheDocument();

      const skipLink = screen.getByRole('link', { name: /saltar al contenido principal/i });
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#intelligence-main-content');
    });

    it('hides Knowledge Center tab when current user lacks required role', () => {
      mockUseOptionalAuth.mockReturnValue({
        currentUser: { id: 'usr_basic', roles: ['CLINICAL_STAFF'] },
        hasRole: (r: string) => r === 'CLINICAL_STAFF',
      });

      render(
        <MemoryRouter initialEntries={['/intelligence']}>
          <IntelligenceLayout>
            <div>Vista</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      // Assistant tab is always visible
      expect(screen.getByRole('link', { name: /asistente/i })).toBeInTheDocument();

      // Knowledge Center tab should be hidden for unauthorized staff
      expect(screen.queryByRole('link', { name: /base de conocimiento/i })).not.toBeInTheDocument();
    });
  });
});
