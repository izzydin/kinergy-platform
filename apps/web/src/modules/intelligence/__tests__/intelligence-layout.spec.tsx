import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  IntelligenceLayout,
  IntelligencePageHeader,
  IntelligencePageContainer,
  AIHealthPill,
} from '../components';

describe('AI-09.1.03: Intelligence Shared Layout & Composition Architecture', () => {
  describe('IntelligenceLayout Shell Component', () => {
    it('renders the layout container with accessibility landmarks (region, banner, navigation, main)', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <Routes>
            <Route path="/intelligence" element={<IntelligenceLayout />}>
              <Route path="chat" element={<div>Inner Chat Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );

      // Verify landmarks
      expect(
        screen.getByRole('region', { name: /espacio de trabajo kynergy intelligence/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(
        screen.getByRole('navigation', { name: /subsecciones de inteligencia/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('displays module branding title and version badge', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence']}>
          <IntelligenceLayout>
            <div>Child Test</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      expect(screen.getByText('Kynergy Intelligence')).toBeInTheDocument();
      expect(screen.getByText('v1.0')).toBeInTheDocument();
    });

    it('renders navigation tabs for Chat and Knowledge with correct active states', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <IntelligenceLayout>
            <div>Child Content</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      const chatTab = screen.getByRole('link', { name: /chat asistente/i });
      const knowledgeTab = screen.getByRole('link', { name: /base de conocimiento/i });

      expect(chatTab).toBeInTheDocument();
      expect(knowledgeTab).toBeInTheDocument();

      expect(chatTab).toHaveAttribute('href', '/intelligence/chat');
      expect(knowledgeTab).toHaveAttribute('href', '/intelligence/knowledge');

      // Chat is active tab
      expect(chatTab.className).toContain('border-primary');
      expect(chatTab.className).toContain('text-primary');
    });

    it('renders child outlet inside role="main" container', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <IntelligenceLayout>
            <div data-testid="test-child-content">Active Workspace View</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      const mainRegion = screen.getByRole('main');
      expect(mainRegion).toContainElement(screen.getByTestId('test-child-content'));
      expect(mainRegion.className).toContain('overflow-hidden');
    });
  });

  describe('IntelligencePageHeader Component', () => {
    it('renders title, description and optional status badge', () => {
      render(
        <IntelligencePageHeader
          title="Título de Prueba"
          description="Descripción de prueba para el módulo"
          badge={<span data-testid="test-badge">Badge Info</span>}
        />,
      );

      expect(screen.getByText('Título de Prueba')).toBeInTheDocument();
      expect(screen.getByText('Descripción de prueba para el módulo')).toBeInTheDocument();
      expect(screen.getByTestId('test-badge')).toBeInTheDocument();
    });

    it('renders action controls slot when provided', () => {
      render(
        <IntelligencePageHeader
          title="Vista con Acciones"
          actions={<button type="button">Acción Principal</button>}
        />,
      );

      expect(screen.getByTestId('intelligence-page-header-actions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /acción principal/i })).toBeInTheDocument();
    });
  });

  describe('IntelligencePageContainer Component', () => {
    it('renders with default flex-1 min-h-0 overflow-hidden layout constraints', () => {
      render(
        <IntelligencePageContainer testId="test-container">
          <div>Panned View Content</div>
        </IntelligencePageContainer>,
      );

      const container = screen.getByTestId('test-container');
      expect(container).toBeInTheDocument();
      expect(container.className).toContain('flex-1');
      expect(container.className).toContain('min-h-0');
      expect(container.className).toContain('overflow-hidden');
    });

    it('enables vertical scrolling when scrollable is true', () => {
      render(
        <IntelligencePageContainer testId="scrollable-container" scrollable>
          <div>Scrollable Document Content</div>
        </IntelligencePageContainer>,
      );

      const container = screen.getByTestId('scrollable-container');
      expect(container.className).toContain('overflow-y-auto');
    });
  });

  describe('AIHealthPill Component', () => {
    it('renders healthy status by default with emerald styling', () => {
      render(<AIHealthPill status="healthy" />);

      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveAttribute('role', 'status');
      expect(pill).toHaveTextContent('AI En línea');
      expect(pill.className).toMatch(/text-emerald-(?:400|700)/);
    });

    it('renders degraded status with amber styling', () => {
      render(<AIHealthPill status="degraded" />);

      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('AI Degradado');
      expect(pill.className).toMatch(/text-amber-(?:400|700)/);
    });

    it('renders unhealthy status with rose styling', () => {
      render(<AIHealthPill status="unhealthy" />);

      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('AI Fuera de servicio');
      expect(pill.className).toMatch(/text-rose-(?:400|700)/);
    });

    it('supports custom label override', () => {
      render(<AIHealthPill status="healthy" label="Ollama + pgvector Activos" />);

      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('Ollama + pgvector Activos');
    });
  });
});
