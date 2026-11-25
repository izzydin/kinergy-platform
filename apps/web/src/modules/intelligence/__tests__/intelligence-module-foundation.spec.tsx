import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { navigationRegistry } from '../../../app/navigation/navigation-registry';

import * as IntelligenceModule from '../index';
import { IntelligenceLayout } from '../components/intelligence-layout';
import { AIHealthPill } from '../components/ai-health-pill';
import { IntelligenceErrorBoundary } from '../components/intelligence-error-boundary';
import { ChatPage } from '../assistant/routes/chat-page';
import { KnowledgePage } from '../knowledge/routes/knowledge-page';
import { DocumentDetailPage } from '../knowledge/routes/document-detail-page';

// Faulty component to test error boundary
const FaultyComponent: React.FC = () => {
  throw new Error('Test boundary crash');
};

describe('Intelligence Module Foundation (Milestone AI-09.1.01)', () => {
  describe('1. Module Public Entry Point & Exports', () => {
    it('should export all public components, routers, and navigation helpers', () => {
      expect(IntelligenceModule.IntelligenceSubRouter).toBeDefined();
      expect(IntelligenceModule.IntelligenceLayout).toBeDefined();
      expect(IntelligenceModule.AIHealthPill).toBeDefined();
      expect(IntelligenceModule.IntelligenceErrorBoundary).toBeDefined();
      expect(IntelligenceModule.intelligenceNavigationItems).toBeDefined();
      expect(IntelligenceModule.registerIntelligenceNavigation).toBeDefined();
    });
  });

  describe('2. Central Route & Navigation Registry Integration', () => {
    it('should register intelligence module with moduleRegistry', () => {
      const registered = moduleRegistry.getRegisteredModules();
      const intelligenceModule = registered.find((m) => m.id === 'intelligence');

      expect(intelligenceModule).toBeDefined();
      expect(intelligenceModule?.prefix).toBe('/intelligence');
      expect(intelligenceModule?.title).toBe('Kynergy Intelligence');
      expect(intelligenceModule?.isProtected).toBe(true);
      expect(intelligenceModule?.component).toBe(IntelligenceModule.IntelligenceSubRouter);
    });

    it('should register intelligence navigation entries with navigationRegistry', () => {
      const items = navigationRegistry.getItems();
      const chatItem = items.find((i) => i.id === 'intelligence:chat');
      const knowledgeItem = items.find((i) => i.id === 'intelligence:knowledge');

      expect(chatItem).toBeDefined();
      expect(chatItem?.path).toBe('/intelligence/chat');
      expect(chatItem?.section).toBe('intelligence');

      expect(knowledgeItem).toBeDefined();
      expect(knowledgeItem?.path).toBe('/intelligence/knowledge');
      expect(knowledgeItem?.section).toBe('intelligence');
    });
  });

  describe('3. Shared IntelligenceLayout Shell', () => {
    it('should render header, title, live health pill, and navigation tabs', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <IntelligenceLayout>
            <div data-testid="test-child-content">Child View Content</div>
          </IntelligenceLayout>
        </MemoryRouter>,
      );

      expect(screen.getByText('Kynergy Intelligence')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Asistencia conversacional fundamentada y centro de documentación clínica',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('ai-health-pill')).toBeInTheDocument();

      // Navigation tab links
      const chatTab = screen.getByRole('link', { name: /Chat Asistente/i });
      const knowledgeTab = screen.getByRole('link', { name: /Base de Conocimiento/i });
      expect(chatTab).toBeInTheDocument();
      expect(knowledgeTab).toBeInTheDocument();

      // Child outlet content
      expect(screen.getByTestId('test-child-content')).toBeInTheDocument();
    });
  });

  describe('4. AIHealthPill Component', () => {
    it('should render healthy status by default', () => {
      render(<AIHealthPill />);
      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('AI En línea');
    });

    it('should render degraded status when configured', () => {
      render(<AIHealthPill status="degraded" />);
      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('AI Degradado');
    });

    it('should render unhealthy status when offline', () => {
      render(<AIHealthPill status="unhealthy" />);
      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('AI Fuera de servicio');
    });

    it('should display custom label when provided', () => {
      render(<AIHealthPill status="healthy" label="Ollama 3.2 Activo" />);
      const pill = screen.getByTestId('ai-health-pill');
      expect(pill).toHaveTextContent('Ollama 3.2 Activo');
    });
  });

  describe('5. IntelligenceErrorBoundary', () => {
    // Suppress expected console.error during boundary crash test
    const originalConsoleError = console.error;
    beforeAll(() => {
      console.error = () => {};
    });
    afterAll(() => {
      console.error = originalConsoleError;
    });

    it('should render fallback card with retry button when child throws', () => {
      render(
        <IntelligenceErrorBoundary>
          <FaultyComponent />
        </IntelligenceErrorBoundary>,
      );

      expect(screen.getByTestId('intelligence-error-fallback')).toBeInTheDocument();
      expect(screen.getByText(/Error en el módulo de Inteligencia/i)).toBeInTheDocument();
      expect(screen.getByText(/Test boundary crash/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    });
  });

  describe('6. Foundational Page Placeholders', () => {
    it('should render ChatPage with verified RAG badge', () => {
      render(
        <MemoryRouter>
          <ChatPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('intelligence-chat-page')).toBeInTheDocument();
      expect(screen.getByText(/Asistente Conversacional Kynergy/i)).toBeInTheDocument();
      expect(screen.getByText(/RAG Verificado/i)).toBeInTheDocument();
    });

    it('should render ChatPage with active conversation id when param is present', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat/conv-1234']}>
          <Routes>
            <Route path="/intelligence/chat/:conversationId" element={<ChatPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('conv-1234')).toBeInTheDocument();
    });

    it('should render KnowledgePage placeholder with accepted formats', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <KnowledgePage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('intelligence-knowledge-page')).toBeInTheDocument();
      expect(screen.getByText(/Base de Conocimiento & Documentación/i)).toBeInTheDocument();
      expect(screen.getByText(/PDF, DOCX, MD, TXT/i)).toBeInTheDocument();
    });

    it('should render DocumentDetailPage with documentId parameter', () => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/intelligence/knowledge/documents/doc-5678']}>
            <Routes>
              <Route
                path="/intelligence/knowledge/documents/:documentId"
                element={<DocumentDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('intelligence-document-detail-page')).toBeInTheDocument();
      expect(screen.getByText(/ID: doc-5678/i)).toBeInTheDocument();
    });
  });
});
