import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Bot, BookOpen } from 'lucide-react';
import {
  IntelligenceLoadingState,
  IntelligenceEmptyState,
  IntelligenceErrorState,
  sanitizeIntelligenceErrorMessage,
  IntelligenceErrorBoundary,
  IntelligenceLayout,
  IntelligencePageHeader,
} from '../components';

describe('AI-09.1.05: Intelligence Responsive Foundations & Shared UI States', () => {
  describe('1. IntelligenceLoadingState Primitive', () => {
    it('renders with WCAG 2.2 status semantics, aria-busy and aria-live announcements', () => {
      render(
        <IntelligenceLoadingState
          variant="page"
          message="Cargando asistente de prueba..."
          testId="test-loading"
        />,
      );

      const statusEl = screen.getByRole('status');
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute('aria-busy', 'true');
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(screen.getByText('Cargando asistente de prueba...')).toHaveClass('sr-only');
    });

    it('renders chat variant with conversational bubble and composer skeletons', () => {
      const { container } = render(<IntelligenceLoadingState variant="chat" />);

      // Skeletons have motion-reduce:animate-none classes
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
      skeletons.forEach((skel) => {
        expect(skel.className).toContain('motion-reduce:animate-none');
      });
    });

    it('renders knowledge variant with toolbar and document card skeletons', () => {
      const { container } = render(<IntelligenceLoadingState variant="knowledge" />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('2. IntelligenceEmptyState Primitive', () => {
    it('renders title, description, icon, and badge with accessible region semantics', () => {
      render(
        <IntelligenceEmptyState
          title="Biblioteca vacía"
          description="No se encontraron documentos indexados en el motor vectorial."
          icon={BookOpen}
          badge={<span data-testid="empty-badge">0 Documentos</span>}
          action={<button type="button">Subir Documento</button>}
          testId="custom-empty"
        />,
      );

      const region = screen.getByRole('region', { name: /biblioteca vacía/i });
      expect(region).toBeInTheDocument();
      expect(screen.getByText('Biblioteca vacía')).toBeInTheDocument();
      expect(
        screen.getByText('No se encontraron documentos indexados en el motor vectorial.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('empty-badge')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /subir documento/i })).toBeInTheDocument();
    });

    it('renders secondary action buttons in responsive actions container', () => {
      render(
        <IntelligenceEmptyState
          title="Sin Conversaciones"
          action={<button type="button">Nueva Consulta</button>}
          secondaryAction={<button type="button">Ver Tutorial</button>}
          testId="chat-empty"
        />,
      );

      expect(screen.getByTestId('chat-empty-actions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /nueva consulta/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ver tutorial/i })).toBeInTheDocument();
    });
  });

  describe('3. IntelligenceErrorState Primitive & Message Sanitization', () => {
    it('renders with role="alert" and aria-live="assertive"', () => {
      render(
        <IntelligenceErrorState
          title="Error en la consulta"
          error="No se pudo conectar con el motor LLM."
          testId="test-error"
        />,
      );

      const alertEl = screen.getByRole('alert');
      expect(alertEl).toBeInTheDocument();
      expect(alertEl).toHaveAttribute('aria-live', 'assertive');
      expect(screen.getByText('Error en la consulta')).toBeInTheDocument();
      expect(screen.getByText('No se pudo conectar con el motor LLM.')).toBeInTheDocument();
    });

    it('sanitizes sensitive database / SQL / stack trace details to protect operational security', () => {
      const rawPrismaError =
        'Invalid `prisma.vectorChunk.findMany()` invocation: Connection refused to pgvector:5432. Stack trace: at Object.query (/app/dist/bundle.js:12)';
      const sanitized = sanitizeIntelligenceErrorMessage(rawPrismaError);

      expect(sanitized).not.toContain('prisma');
      expect(sanitized).not.toContain('pgvector');
      expect(sanitized).not.toContain('Stack trace');
      expect(sanitized).toBe(
        'El servicio de Inteligencia experimentó un inconveniente temporal. Intenta nuevamente en unos instantes.',
      );
    });

    it('renders correlation reference ID when provided', () => {
      render(<IntelligenceErrorState error="Falla de prueba" correlationId="err-trace-998877" />);

      expect(screen.getByText(/id de referencia: err-trace-998877/i)).toBeInTheDocument();
    });

    it('invokes onRetry handler when user clicks retry button', () => {
      const handleRetry = jest.fn();
      render(
        <IntelligenceErrorState
          error="Error recuperable"
          onRetry={handleRetry}
          retryLabel="Reintentar Operación"
        />,
      );

      const retryBtn = screen.getByRole('button', { name: /reintentar operación/i });
      fireEvent.click(retryBtn);

      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Feature Error Boundary Integration', () => {
    it('catches uncaught rendering errors and renders IntelligenceErrorState fallback', () => {
      // Mock console.error to keep test logs clean
      const originalError = console.error;
      console.error = jest.fn();

      const BombComponent: React.FC = () => {
        throw new Error('Test crash in child component');
      };

      render(
        <IntelligenceErrorBoundary>
          <BombComponent />
        </IntelligenceErrorBoundary>,
      );

      expect(screen.getByTestId('intelligence-error-fallback')).toBeInTheDocument();
      expect(screen.getByText('Error en el módulo de Inteligencia')).toBeInTheDocument();
      expect(screen.getByText('Test crash in child component')).toBeInTheDocument();

      console.error = originalError;
    });
  });

  describe('5. Responsive Foundations & Viewport Adaptability', () => {
    it('enforces overflow-x-hidden container constraint preventing horizontal scroll', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <IntelligenceLayout>
            <div>Test View Content</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      const layout = screen.getByTestId('intelligence-layout');
      expect(layout.className).toContain('overflow-x-hidden');
    });

    it('adapts IntelligencePageHeader with word wrapping and responsive action row', () => {
      render(
        <IntelligencePageHeader
          title="Título extremadamente largo para verificar comportamiento en pantallas móviles estrechas de 360px"
          description="Descripción extendida para verificar contención tipográfica sin desbordamiento horizontal."
          icon={Bot}
          actions={<button type="button">Acción Responsive</button>}
        />,
      );

      const header = screen.getByTestId('intelligence-page-header');
      expect(header.className).toContain('min-w-0');

      const title = screen.getByText(/título extremadamente largo/i);
      expect(title.className).toContain('break-words');
    });
  });
});
