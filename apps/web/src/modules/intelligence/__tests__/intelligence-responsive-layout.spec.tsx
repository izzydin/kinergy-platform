import '@testing-library/jest-dom';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation';
import { BreadcrumbProvider } from '../../../app/breadcrumbs';
import { SlotProvider } from '../../../shared/ui/slots/SlotProvider';
import { DashboardLayout } from '../../../app/layouts/dashboard-layout';
import { IntelligenceLayout } from '../components/intelligence-layout';
import { ChatPage } from '../assistant/routes/chat-page';
import { SourceDetailsDrawer } from '../assistant/components/source-details-drawer';
import { KnowledgeLibraryToolbar } from '../knowledge/components/knowledge-library-toolbar';
import { KnowledgeDocumentTable } from '../knowledge/components/knowledge-document-table';
import type { RAGSourceCitationDto } from '../assistant/types/assistant.types';
import type { KnowledgeDocumentItem } from '../knowledge/types/knowledge-contract.types';

expect.extend(toHaveNoViolations);

const TEST_ADMIN_USER = {
  id: 'usr-admin-resp',
  email: 'admin.resp@kinergy.platform',
  name: 'Admin Responsive',
  roles: ['ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-resp-001',
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithFullProviders(
  ui: React.ReactElement,
  { initialEntries = ['/intelligence/chat'] } = {},
) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NotificationProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider initialSessionOverride={TEST_ADMIN_USER}>
            <FeatureFlagProvider>
              <NavigationProvider>
                <BreadcrumbProvider>
                  <SlotProvider>{ui}</SlotProvider>
                </BreadcrumbProvider>
              </NavigationProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>
      </NotificationProvider>
    </QueryClientProvider>,
  );
}

describe('DS.05 — Responsive Layout and Interaction Behavior Validation Suite', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  describe('1. Module Layout Boundary & Viewport Height Constraints', () => {
    it('applies viewport height boundaries and prevents outer page horizontal scrollbars', () => {
      renderWithFullProviders(
        <DashboardLayout>
          <IntelligenceLayout>
            <div data-testid="test-content">Contenido Responsive</div>
          </IntelligenceLayout>
        </DashboardLayout>,
      );

      const layout = screen.getByTestId('intelligence-layout');
      expect(layout).toHaveClass(
        'flex',
        'h-[calc(100vh-theme(spacing.28))]',
        'md:h-[calc(100vh-theme(spacing.24))]',
        'overflow-hidden',
        'overflow-x-hidden',
      );

      // Verify subnavigation row has horizontal scroll containment for narrow viewports
      const subnav = screen.getByRole('navigation', { name: /subsecciones de inteligencia/i });
      expect(subnav).toHaveClass('overflow-x-auto', 'scrollbar-none');
    });

    it('passes automated WCAG accessibility audit for the module layout container', async () => {
      const { container } = renderWithFullProviders(
        <IntelligenceLayout>
          <div className="p-4">
            <h2>Panel Accesible</h2>
          </div>
        </IntelligenceLayout>,
      );

      const results = await axe(container, {
        rules: {
          // Scoped layout fragment: when tested in isolation, banner and main are inside module region landmark
          'landmark-banner-is-top-level': { enabled: false },
          'landmark-main-is-top-level': { enabled: false },
        },
      });
      expect(results).toHaveNoViolations();
    });
  });

  describe('2. Mobile Conversation Drawer & Touch Interactions', () => {
    it('renders mobile menu button with accessible dialog trigger semantics and minimum touch targets', async () => {
      renderWithFullProviders(
        <Routes>
          <Route
            path="/intelligence/chat"
            element={
              <IntelligenceLayout>
                <ChatPage />
              </IntelligenceLayout>
            }
          />
        </Routes>,
      );

      // Mobile sidebar button must exist and have proper ARIA attributes
      const mobileToggleBtn = await screen.findByRole('button', {
        name: /abrir panel de conversaciones/i,
      });
      expect(mobileToggleBtn).toBeInTheDocument();
      expect(mobileToggleBtn).toHaveAttribute('aria-expanded', 'false');
      expect(mobileToggleBtn).toHaveAttribute('aria-haspopup', 'dialog');
      expect(mobileToggleBtn).toHaveClass('min-h-[32px]', 'min-w-[32px]', 'md:hidden');
    });

    it('opens mobile conversation drawer, locks body overflow, and dismisses on Escape key', async () => {
      renderWithFullProviders(
        <Routes>
          <Route
            path="/intelligence/chat"
            element={
              <IntelligenceLayout>
                <ChatPage />
              </IntelligenceLayout>
            }
          />
        </Routes>,
      );

      const mobileToggleBtn = await screen.findByRole('button', {
        name: /abrir panel de conversaciones/i,
      });

      // Open drawer
      fireEvent.click(mobileToggleBtn);

      await waitFor(() => {
        expect(mobileToggleBtn).toHaveAttribute('aria-expanded', 'true');
      });

      // Dialog must be present with modal semantics
      const drawerDialog = screen.getByRole('dialog', { name: /historial de conversaciones/i });
      expect(drawerDialog).toBeInTheDocument();
      expect(drawerDialog).toHaveAttribute('aria-modal', 'true');
      expect(document.body.style.overflow).toBe('hidden');

      // Dismiss using Escape key
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('');
      });
    });

    it('dismisses mobile conversation drawer when clicking close button or backdrop', async () => {
      renderWithFullProviders(
        <Routes>
          <Route
            path="/intelligence/chat"
            element={
              <IntelligenceLayout>
                <ChatPage />
              </IntelligenceLayout>
            }
          />
        </Routes>,
      );

      const mobileToggleBtn = await screen.findByRole('button', {
        name: /abrir panel de conversaciones/i,
      });
      fireEvent.click(mobileToggleBtn);

      const closeBtn = await screen.findByRole('button', {
        name: /cerrar panel de conversaciones/i,
      });
      expect(closeBtn).toBeInTheDocument();

      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /historial de conversaciones/i })).toBeNull();
        expect(document.body.style.overflow).toBe('');
      });
    });
  });

  describe('3. Chat Composer & Message Feed Responsive Dynamics', () => {
    it('ensures composer buttons meet touch target guidelines and stay anchored at bottom', async () => {
      renderWithFullProviders(
        <Routes>
          <Route
            path="/intelligence/chat"
            element={
              <IntelligenceLayout>
                <ChatPage />
              </IntelligenceLayout>
            }
          />
        </Routes>,
      );

      const composer = await screen.findByTestId('chat-composer');
      expect(composer).toHaveClass('shrink-0', 'border-t');

      const sendButton = screen.getByRole('button', { name: /enviar mensaje/i });
      expect(sendButton).toHaveClass('min-h-[32px]', 'min-w-[32px]');
    });
  });

  describe('4. Source Details Drawer Responsive Slide-Over Presentation', () => {
    const mockCitation: RAGSourceCitationDto = {
      citationId: 'cit-resp-001',
      documentId: 'doc-resp-001',
      documentTitle: 'Protocolo de Kinefisiatría Respiratoria',
      originalFileName: 'protocolo_kine_resp_2026_final_v2.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 2048500,
      pageNumber: 14,
      chunkId: 'chk-resp-789',
      relevanceScore: 0.94,
      excerpt:
        'La kinesioterapia respiratoria comprende técnicas manuales e instrumentales para desobstruir la vía aérea...',
      sourceStrategy: 'HYBRID',
      retrievalRank: 1,
    };

    it('renders slide-over drawer with full mobile width and accessible dialog attributes', () => {
      const handleClose = jest.fn();
      renderWithFullProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={handleClose}
          citation={mockCitation}
          citationIndex={0}
        />,
      );

      const drawer = screen.getByTestId('source-details-drawer');
      expect(drawer).toHaveAttribute('role', 'dialog');
      expect(drawer).toHaveAttribute('aria-modal', 'true');

      // Check responsive width classes: w-full max-w-lg (fills mobile, constrained on desktop)
      const panel = drawer.querySelector('.max-w-lg');
      expect(panel).toBeInTheDocument();
      expect(panel).toHaveClass('w-full', 'max-w-lg');

      // Dismiss on close button
      const closeBtn = screen.getByRole('button', { name: /cerrar panel de fuente/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('dismisses source drawer on Escape key and backdrop click', () => {
      const handleClose = jest.fn();
      renderWithFullProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={handleClose}
          citation={mockCitation}
          citationIndex={0}
        />,
      );

      // Escape key
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Backdrop click
      const backdrop = screen.getByTestId('source-details-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(2);
    });
  });

  describe('5. Knowledge Center Responsive Toolbar & Table Containment', () => {
    it('verifies KnowledgeLibraryToolbar responsive wrapping and input sizing', () => {
      renderWithFullProviders(
        <KnowledgeLibraryToolbar
          searchTerm=""
          onSearchChange={jest.fn()}
          onSearchClear={jest.fn()}
          onVisibilityScopeChange={jest.fn()}
          onMimeTypeChange={jest.fn()}
          isFiltered={false}
          onResetFilters={jest.fn()}
        />,
      );

      const toolbar = screen.getByTestId('knowledge-library-toolbar');
      expect(toolbar).toHaveClass('flex', 'flex-col');

      const searchInput = screen.getByTestId('library-search-input');
      expect(searchInput).toHaveClass('w-full');
    });

    it('verifies KnowledgeDocumentTable contains horizontal overflow within card barrier', () => {
      const mockDocuments: KnowledgeDocumentItem[] = [
        {
          id: 'doc-resp-tbl-1',
          title: 'Manual de Rehabilitación Neuromuscular Extenso con Título Muy Largo Para Pruebas',
          currentVersionId: 'ver-resp-001',
          uploadedBy: 'usr-admin-resp',
          originalFileName:
            'manual_rehabilitacion_neuromuscular_protocolo_hospitalario_2026_version_completa.pdf',
          fileSize: 10485760,
          mimeType: 'application/pdf',
          fileExtension: 'pdf',
          visibilityScope: 'CLINICAL_STAFF',
          versionNumber: 3,
          ingestionStatus: 'READY',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          versions: [],
        },
      ];

      renderWithFullProviders(
        <KnowledgeDocumentTable
          documents={mockDocuments}
          totalCount={1}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'createdAt', desc: true }}
          onToggleSort={jest.fn()}
        />,
      );

      const tableContainer = screen.getByTestId('knowledge-document-table-container');
      expect(tableContainer).toBeInTheDocument();

      // DataTable inner wrapper must have overflow-x-auto to prevent whole-page layout blowouts
      const scrollWrapper = tableContainer.querySelector('.overflow-x-auto');
      expect(scrollWrapper).toBeInTheDocument();
      expect(scrollWrapper).toHaveClass('overflow-x-auto');
    });
  });
});
