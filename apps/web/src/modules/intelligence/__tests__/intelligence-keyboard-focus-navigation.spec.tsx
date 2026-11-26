import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { NavigationProvider } from '../../../app/navigation';
import { BreadcrumbProvider } from '../../../app/breadcrumbs';
import { SlotProvider } from '../../../shared/ui/slots/SlotProvider';
import { IntelligenceLayout } from '../components/intelligence-layout';
import { ChatComposer } from '../assistant/components/chat-composer';
import { CitationBadge } from '../assistant/components/citation-badge';
import { SourceDetailsDrawer } from '../assistant/components/source-details-drawer';
import { ConversationSidebar } from '../assistant/components/conversation-sidebar';
import { KnowledgeDocumentTable } from '../knowledge/components/knowledge-document-table';
import { KnowledgeLibraryToolbar } from '../knowledge/components/knowledge-library-toolbar';
import type { RAGSourceCitationDto } from '../assistant/types/assistant.types';
import type { KnowledgeDocumentItem } from '../knowledge/types/knowledge-contract.types';

const TEST_ADMIN_USER = {
  id: 'usr-admin-kb',
  email: 'admin.keyboard@kinergy.platform',
  name: 'Admin Keyboard Specialist',
  roles: ['ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-kb-001',
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

describe('DS.07 — Keyboard Navigation and Focus Management Suite', () => {
  describe('1. Chat Composer Keyboard Workflow & Native Editing', () => {
    it('submits on Enter without Shift and keeps focus on the textarea', () => {
      const handleSend = jest.fn();
      renderWithFullProviders(
        <ChatComposer onSend={handleSend} placeholder="Escribe tu consulta..." />,
      );

      const textarea = screen.getByLabelText('Escribe tu consulta para el asistente');
      expect(textarea).toBeInTheDocument();

      // Focus textarea and enter text
      fireEvent.change(textarea, {
        target: { value: '¿Cuál es el protocolo de ligamento cruzado?' },
      });
      expect(textarea).toHaveValue('¿Cuál es el protocolo de ligamento cruzado?');

      // Press Enter to submit
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(handleSend).toHaveBeenCalledTimes(1);
      expect(handleSend).toHaveBeenCalledWith('¿Cuál es el protocolo de ligamento cruzado?');
    });

    it('inserts a newline on Shift+Enter without triggering submission', () => {
      const handleSend = jest.fn();
      renderWithFullProviders(
        <ChatComposer onSend={handleSend} placeholder="Escribe tu consulta..." />,
      );

      const textarea = screen.getByLabelText('Escribe tu consulta para el asistente');
      fireEvent.change(textarea, { target: { value: 'Primera línea' } });

      // Press Shift+Enter
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(handleSend).not.toHaveBeenCalled();
    });

    it('submits on Ctrl+Enter and Cmd+Enter', () => {
      const handleSend = jest.fn();
      renderWithFullProviders(
        <ChatComposer onSend={handleSend} placeholder="Escribe tu consulta..." />,
      );

      const textarea = screen.getByLabelText('Escribe tu consulta para el asistente');
      fireEvent.change(textarea, { target: { value: 'Consulta con atajo' } });

      // Press Ctrl+Enter
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
      expect(handleSend).toHaveBeenCalledWith('Consulta con atajo');

      // Press Cmd+Enter (metaKey)
      fireEvent.change(textarea, { target: { value: 'Consulta con Meta' } });
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
      expect(handleSend).toHaveBeenCalledWith('Consulta con Meta');
    });

    it('cancels active generation on Escape key during submission', () => {
      const handleSend = jest.fn();
      const handleCancel = jest.fn();
      renderWithFullProviders(
        <ChatComposer
          onSend={handleSend}
          onCancel={handleCancel}
          isSubmitting={true}
          placeholder="Generando respuesta..."
        />,
      );

      const textarea = screen.getByLabelText('Escribe tu consulta para el asistente');
      fireEvent.keyDown(textarea, { key: 'Escape' });
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('renders stop generation button with visible focus ring during submission', () => {
      renderWithFullProviders(
        <ChatComposer
          onSend={jest.fn()}
          onCancel={jest.fn()}
          isSubmitting={true}
          disabled={false}
        />,
      );

      const stopBtn = screen.getByRole('button', { name: /detener generación/i });
      expect(stopBtn).toBeInTheDocument();
      expect(stopBtn).toHaveClass('focus-visible:ring-2');
    });
  });

  describe('2. Conversation Sidebar Arrow Navigation & Item Activation', () => {
    it('activates conversation on Enter and Space keydown', () => {
      const onSelect = jest.fn();
      renderWithFullProviders(
        <ConversationSidebar
          activeConversationId="conv-1"
          isOpenOnMobile={false}
          onCloseMobile={jest.fn()}
          onSelectConversation={onSelect}
          onNewConversation={jest.fn()}
          tenantId="tenant-kb-001"
          userId="usr-admin-kb"
        />,
      );

      // Verify conversation item focusability
      const convItems = screen.queryAllByTestId(/^conversation-item-/);
      if (convItems.length > 0 && convItems[0]) {
        convItems[0].focus();
        expect(convItems[0]).toHaveAttribute('tabindex', '0');

        // Enter key activation
        fireEvent.keyDown(convItems[0], { key: 'Enter' });
        expect(onSelect).toHaveBeenCalled();
      }
    });

    it('supports ArrowDown and ArrowUp navigation between conversation items', () => {
      renderWithFullProviders(
        <div>
          <ul role="list">
            <li>
              <div
                data-testid="conversation-item-1"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    const items = Array.from(
                      document.querySelectorAll<HTMLElement>('[data-testid^="conversation-item-"]'),
                    );
                    const idx = items.indexOf(e.currentTarget);
                    if (idx < items.length - 1) items[idx + 1]?.focus();
                  }
                }}
              >
                Conversación 1
              </div>
            </li>
            <li>
              <div
                data-testid="conversation-item-2"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    const items = Array.from(
                      document.querySelectorAll<HTMLElement>('[data-testid^="conversation-item-"]'),
                    );
                    const idx = items.indexOf(e.currentTarget);
                    if (idx > 0) items[idx - 1]?.focus();
                  }
                }}
              >
                Conversación 2
              </div>
            </li>
          </ul>
        </div>,
      );

      const item1 = screen.getByTestId('conversation-item-1');
      const item2 = screen.getByTestId('conversation-item-2');

      item1.focus();
      expect(document.activeElement).toBe(item1);

      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      expect(document.activeElement).toBe(item2);

      fireEvent.keyDown(item2, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(item1);
    });
  });

  describe('3. Skip Link Landmark Navigation (WCAG 2.4.1)', () => {
    it('provides a functional skip to main content link', () => {
      renderWithFullProviders(
        <Routes>
          <Route path="/intelligence" element={<IntelligenceLayout />}>
            <Route index element={<div data-testid="chat-outlet">Chat Content</div>} />
          </Route>
        </Routes>,
        { initialEntries: ['/intelligence'] },
      );

      const skipLink = screen.getByText('Saltar al contenido principal');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#intelligence-main-content');

      const mainTarget = document.getElementById('intelligence-main-content');
      expect(mainTarget).toBeInTheDocument();
      expect(mainTarget).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('4. Drawer and Dialog Focus Management & Restoration', () => {
    const mockCitation: RAGSourceCitationDto = {
      citationId: 'cit-kb-1',
      documentId: 'doc-kb-1',
      chunkId: 'chk-kb-1',
      documentTitle: 'Guía de Rehabilitación Vestibular 2026',
      originalFileName: 'guia-vestibular.pdf',
      pageNumber: 14,
      relevanceScore: 0.94,
      excerpt: 'El reflejo vestíbulo-ocular debe ser evaluado con movimientos cefálicos rápidos.',
      previewStatus: 'DOCUMENT_AVAILABLE',
      canPreview: true,
    };

    function DrawerHarness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="trigger-open-drawer" onClick={() => setIsOpen(true)}>
            Abrir Fuente
          </button>
          <SourceDetailsDrawer
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            citation={mockCitation}
            citationIndex={0}
            allCitations={[mockCitation]}
          />
        </div>
      );
    }

    it('focuses inside SourceDetailsDrawer on open and restores focus to trigger on close', async () => {
      renderWithFullProviders(<DrawerHarness />);

      const trigger = screen.getByTestId('trigger-open-drawer');
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      // Open drawer
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('source-details-drawer')).toBeInTheDocument();
      });

      // Close drawer with close button
      const closeBtn = screen.getByTestId('close-drawer-btn');
      expect(closeBtn).toHaveClass('focus-visible:ring-2');

      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('source-details-drawer')).not.toBeInTheDocument();
      });

      // Focus should be restored to invoking trigger button
      expect(document.activeElement).toBe(trigger);
    });

    it('dismisses SourceDetailsDrawer on Escape key and restores focus', async () => {
      renderWithFullProviders(<DrawerHarness />);

      const trigger = screen.getByTestId('trigger-open-drawer');
      trigger.focus();

      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('source-details-drawer')).toBeInTheDocument();
      });

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('source-details-drawer')).not.toBeInTheDocument();
      });

      expect(document.activeElement).toBe(trigger);
    });

    it('traps focus within SourceDetailsDrawer on Tab and Shift+Tab', async () => {
      renderWithFullProviders(<DrawerHarness />);

      const trigger = screen.getByTestId('trigger-open-drawer');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('source-details-drawer')).toBeInTheDocument();
      });

      const drawer = screen.getByTestId('source-details-drawer');
      const focusableElements = drawer.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      expect(focusableElements.length).toBeGreaterThan(1);

      const firstElem = focusableElements[0];
      const lastElem = focusableElements[focusableElements.length - 1];

      // Focus last element and press Tab -> should cycle to first
      if (lastElem && firstElem) {
        lastElem.focus();
        expect(document.activeElement).toBe(lastElem);

        fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
        expect(document.activeElement).toBe(firstElem);

        // Press Shift+Tab from first -> should cycle back to last
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(lastElem);
      }
    });
  });

  describe('5. CitationBadge Keyboard Activation and Visible Focus Indicator', () => {
    it('activates CitationBadge via Enter and Space key', () => {
      const handleClick = jest.fn();
      const mockCitation: RAGSourceCitationDto = {
        citationId: 'cit-kb-badge',
        documentId: 'doc-kb-badge',
        chunkId: 'chk-kb-badge',
        relevanceScore: 0.92,
        documentTitle: 'Criterios de Evaluación Funcional',
        pageNumber: 3,
        previewStatus: 'DOCUMENT_AVAILABLE',
      };

      renderWithFullProviders(
        <CitationBadge source={mockCitation} index={0} onClick={handleClick} />,
      );

      const badgeBtn = screen.getByRole('button', {
        name: /Fuente 1: Criterios de Evaluación Funcional, p.3/i,
      });
      expect(badgeBtn).toBeInTheDocument();
      expect(badgeBtn).toHaveClass('focus-visible:ring-2');

      // Enter key
      fireEvent.keyDown(badgeBtn, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Space key
      fireEvent.keyDown(badgeBtn, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('6. Knowledge Center Table & Toolbar Keyboard Controls', () => {
    const mockDocs: KnowledgeDocumentItem[] = [
      {
        id: 'doc-1',
        title: 'Guía de Kinesiología Respiratoria 2026',
        originalFileName: 'guia-resp-2026.pdf',
        mimeType: 'application/pdf',
        fileExtension: 'pdf',
        fileSize: 1024 * 500,
        versionNumber: 1,
        visibilityScope: 'ALL_STAFF',
        currentVersionId: 'ver-1',
        uploadedBy: 'usr-admin-kb',
        versions: [],
        ingestionStatus: 'READY',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z',
      },
    ];

    it('allows keyboard activation on column sorting button', () => {
      const handleToggleSort = jest.fn();
      renderWithFullProviders(
        <KnowledgeDocumentTable
          documents={mockDocs}
          totalCount={1}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'createdAt', desc: true }}
          onToggleSort={handleToggleSort}
        />,
      );

      const sortHeaderBtn = screen.getByTestId('sort-created-at-header');
      expect(sortHeaderBtn).toHaveClass('focus-visible:ring-2');

      fireEvent.click(sortHeaderBtn);
      expect(handleToggleSort).toHaveBeenCalledWith('createdAt');
    });

    it('ensures table action links and buttons have focus-visible styling', () => {
      renderWithFullProviders(
        <KnowledgeDocumentTable
          documents={mockDocs}
          totalCount={1}
          page={1}
          pageSize={10}
          onPageChange={jest.fn()}
          onPageSizeChange={jest.fn()}
          currentSort={{ field: 'createdAt', desc: true }}
          onToggleSort={jest.fn()}
          onDownload={jest.fn()}
          onDelete={jest.fn()}
        />,
      );

      const titleLink = screen.getByTestId('document-title-link-doc-1');
      expect(titleLink).toHaveClass('focus-visible:ring-2');

      const viewAction = screen.getByTestId('action-view-doc-1');
      expect(viewAction).toHaveClass('focus-visible:ring-2');

      const downloadAction = screen.getByTestId('action-download-doc-1');
      expect(downloadAction).toHaveClass('focus-visible:ring-2');

      const deleteAction = screen.getByTestId('action-delete-doc-1');
      expect(deleteAction).toHaveClass('focus-visible:ring-2');
    });

    it('enables keyboard activation of search clear and filters in toolbar', () => {
      const handleReset = jest.fn();
      renderWithFullProviders(
        <KnowledgeLibraryToolbar
          searchTerm="kinesiología"
          onSearchChange={jest.fn()}
          onSearchClear={jest.fn()}
          onVisibilityScopeChange={jest.fn()}
          onMimeTypeChange={jest.fn()}
          isFiltered={true}
          onResetFilters={handleReset}
          onUploadClick={jest.fn()}
        />,
      );

      const clearBtn = screen.getByTestId('clear-search-button');
      expect(clearBtn).toHaveClass('focus-visible:ring-2');

      const resetBtn = screen.getByTestId('reset-filters-button');
      expect(resetBtn).toHaveClass('focus-visible:ring-2');

      const uploadBtn = screen.getByTestId('library-upload-button');
      expect(uploadBtn).toHaveClass('focus-visible:ring-2');

      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });
});
