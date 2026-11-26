import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  calculateContrastRatio,
  OFFICIAL_BRAND_TOKENS,
  APPROVED_NEUTRAL_TOKENS,
  SEMANTIC_STATUS_TOKENS,
} from '@kinergy-platform/ui';
import { IngestionStatusBadge } from '../knowledge/components/ingestion-status-badge';
import { AIHealthPill } from '../components/ai-health-pill';
import { ChatComposer } from '../assistant/components/chat-composer';
import { MessageMetadata } from '../assistant/components/message-metadata';
import { IntelligenceErrorState } from '../components/intelligence-error-state';
import type { IngestionStatus } from '../knowledge/types/knowledge-contract.types';

expect.extend(toHaveNoViolations);

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DS.08 — Color Contrast and Visual Accessibility Suite', () => {
  describe('1. Brand Green (#68CE39) & Core Token Contrast Mathematical Validation', () => {
    it('proves white text on brand green (#68CE39) fails WCAG 2.2 AA normal text requirement', () => {
      const whiteOnGreenRatio = calculateContrastRatio(
        APPROVED_NEUTRAL_TOKENS.white,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
      );
      // Brand green relative luminance causes white text to fail the 4.5:1 AA requirement (~2.0:1)
      expect(whiteOnGreenRatio).toBeLessThan(4.5);
      expect(whiteOnGreenRatio).toBeCloseTo(2.0, 1);
    });

    it('proves dark charcoal (#202522) on brand green (#68CE39) passes WCAG 2.2 AA and AAA', () => {
      const darkOnGreenRatio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
      );
      // Ratio exceeds both 4.5:1 AA and 7.0:1 AAA thresholds (~7.77:1)
      expect(darkOnGreenRatio).toBeGreaterThanOrEqual(7.0);
      expect(darkOnGreenRatio).toBeCloseTo(7.77, 1);
    });

    it('proves brand green (#68CE39) on dark card background (#202522) passes WCAG 2.2 AAA', () => {
      const greenOnDarkCardRatio = calculateContrastRatio(
        OFFICIAL_BRAND_TOKENS.kinergyGreen,
        OFFICIAL_BRAND_TOKENS.kinergyCharcoal,
      );
      expect(greenOnDarkCardRatio).toBeGreaterThanOrEqual(7.0);
    });

    it('proves light theme primary button (white on forest #3F5F25) passes WCAG 2.2 AAA', () => {
      const whiteOnForestRatio = calculateContrastRatio(
        APPROVED_NEUTRAL_TOKENS.white,
        OFFICIAL_BRAND_TOKENS.kinergyForest,
      );
      // Ratio exceeds 7.0:1 AAA threshold (~7.3:1)
      expect(whiteOnForestRatio).toBeGreaterThanOrEqual(7.0);
      expect(whiteOnForestRatio).toBeCloseTo(7.3, 1);
    });

    it('verifies all semantic status tokens (success, warning, danger, info) exceed 4.5:1', () => {
      // Success: White on Forest
      const successRatio = calculateContrastRatio(
        SEMANTIC_STATUS_TOKENS.success.foreground,
        SEMANTIC_STATUS_TOKENS.success.default,
      );
      expect(successRatio).toBeGreaterThanOrEqual(4.5);

      // Warning: White on Amber-700 (#B45309)
      const warningRatio = calculateContrastRatio(
        SEMANTIC_STATUS_TOKENS.warning.foreground,
        SEMANTIC_STATUS_TOKENS.warning.default,
      );
      expect(warningRatio).toBeGreaterThanOrEqual(4.5);

      // Danger: White on Red-700 (#B91C1C)
      const dangerRatio = calculateContrastRatio(
        SEMANTIC_STATUS_TOKENS.danger.foreground,
        SEMANTIC_STATUS_TOKENS.danger.default,
      );
      expect(dangerRatio).toBeGreaterThanOrEqual(4.5);

      // Info: White on Sky-700 (#0369A1)
      const infoRatio = calculateContrastRatio(
        SEMANTIC_STATUS_TOKENS.info.foreground,
        SEMANTIC_STATUS_TOKENS.info.default,
      );
      expect(infoRatio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('2. Color-Independent Meaning (WCAG 1.4.1)', () => {
    const statuses: IngestionStatus[] = [
      'READY',
      'INDEXING',
      'PROCESSING',
      'VALIDATING',
      'UPLOADED',
      'FAILED',
      'CANCELLED',
    ];

    it.each(statuses)('provides text label and accessible role/label for status %s', (status) => {
      renderWithClient(<IngestionStatusBadge status={status} />);
      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('aria-label');
      expect(badge.getAttribute('aria-label')).toContain('Estado de indexación:');
      // Must contain descriptive text inside, not just an icon or color
      expect(badge.textContent).not.toBe('');
    });

    it('ensures AIHealthPill communicates health status with text and aria-label', () => {
      renderWithClient(<AIHealthPill status="healthy" />);
      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveAttribute('role', 'status');
      expect(pill).toHaveAttribute('aria-label', 'Estado del Asistente AI: AI En línea');
      expect(pill).toHaveTextContent('AI En línea');
    });

    it('ensures grounded status in MessageMetadata provides explicit textual explanation', () => {
      const { rerender } = renderWithClient(
        <MessageMetadata createdAt="2026-03-01T12:00:00Z" grounded={true} />,
      );
      expect(screen.getByTestId('grounded-badge-verified')).toHaveTextContent('Fundamentado');

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <MessageMetadata createdAt="2026-03-01T12:00:00Z" grounded={false} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(screen.getByTestId('grounded-badge-abstention')).toHaveTextContent(
        'Sin evidencia directa',
      );
    });
  });

  describe('3. Contrast Hardening on Status Badges and Ambient UI', () => {
    it('applies high-contrast text classes (*-700 / dark:text-*-300) on IngestionStatusBadge', () => {
      const { rerender } = renderWithClient(<IngestionStatusBadge status="READY" />);
      expect(screen.getByTestId('ingestion-status-ready')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <IngestionStatusBadge status="FAILED" />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(screen.getByTestId('ingestion-status-failed')).toHaveClass(
        'text-rose-700',
        'dark:text-rose-300',
      );

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <IngestionStatusBadge status="UPLOADED" />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(screen.getByTestId('ingestion-status-uploaded')).toHaveClass(
        'text-amber-700',
        'dark:text-amber-300',
      );
    });

    it('applies high-contrast text classes on AIHealthPill', () => {
      renderWithClient(<AIHealthPill status="healthy" />);
      expect(screen.getByTestId('ai-health-pill')).toHaveClass(
        'text-emerald-700',
        'dark:text-emerald-300',
      );
    });

    it('ensures diagnostic reference ID in IntelligenceErrorState does not use low-opacity muted text', () => {
      renderWithClient(
        <IntelligenceErrorState
          title="Error en búsqueda"
          error="Error de conexión"
          correlationId="diag-12345"
        />,
      );
      const refId = screen.getByText(/ID de referencia: diag-12345/);
      expect(refId).toHaveClass('text-muted-foreground');
      expect(refId).not.toHaveClass('text-muted-foreground/70');
    });
  });

  describe('4. Visual Accessibility & Motion Preferences (WCAG 2.3.3 & 2.2.2)', () => {
    it('respects reduced-motion preference on AIHealthPill pulsing indicator', () => {
      renderWithClient(<AIHealthPill status="healthy" />);
      const pill = screen.getByTestId('ai-health-pill');
      const dot = pill.querySelector('span[aria-hidden="true"]');
      expect(dot).toHaveClass('motion-safe:animate-pulse');
    });

    it('respects reduced-motion preference on IngestionStatusBadge spinning icon', () => {
      renderWithClient(<IngestionStatusBadge status="INDEXING" />);
      const badge = screen.getByTestId('ingestion-status-indexing');
      const spinner = badge.querySelector('.motion-safe\\:animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('5. Automated WCAG 2.2 AA Visual Audits (jest-axe)', () => {
    it('passes automated accessibility audit on IngestionStatusBadge across states', async () => {
      const { container } = renderWithClient(<IngestionStatusBadge status="READY" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated accessibility audit on AIHealthPill', async () => {
      const { container } = renderWithClient(<AIHealthPill status="healthy" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated accessibility audit on ChatComposer in idle state', async () => {
      const { container } = renderWithClient(
        <ChatComposer onSend={jest.fn()} placeholder="Escribe tu consulta médica..." />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated accessibility audit on IntelligenceErrorState', async () => {
      const { container } = renderWithClient(
        <IntelligenceErrorState
          title="Servicio no disponible"
          error="Inconveniente temporal en el motor RAG."
          correlationId="err-audit-99"
          onRetry={jest.fn()}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
