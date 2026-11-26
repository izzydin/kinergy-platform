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
import { IntelligenceLayout } from '../components/intelligence-layout';
import { ChatPage } from '../assistant/routes/chat-page';
import { ChatWorkspace } from '../assistant/components/chat-workspace';
import { ChatWorkspaceHeader } from '../assistant/components/chat-workspace-header';
import { UserMessage } from '../assistant/components/user-message';
import { AssistantMessage } from '../assistant/components/assistant-message';
import { MarkdownRenderer } from '../assistant/components/markdown-renderer';
import { CodeBlock } from '../assistant/components/code-block';
import { CitationBadge } from '../assistant/components/citation-badge';
import { SourceDetailsDrawer } from '../assistant/components/source-details-drawer';
import { DeleteConversationDialog } from '../assistant/components/delete-conversation-dialog';
import { KnowledgeLibraryToolbar } from '../knowledge/components/knowledge-library-toolbar';
import { RecentDocumentsList } from '../knowledge/components/recent-documents-list';
import type { ChatMessage, RAGSourceCitationDto } from '../assistant/types/assistant.types';
import type { KnowledgeDocumentItem } from '../knowledge/types/knowledge-contract.types';

expect.extend(toHaveNoViolations);

const TEST_ADMIN_USER = {
  id: 'usr-admin-a11y',
  email: 'admin.a11y@kinergy.platform',
  name: 'Admin Accessibility',
  roles: ['ADMIN'],
  permissions: ['*'],
  tenantId: 'tenant-a11y-001',
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

describe('DS.06 — Semantic HTML and ARIA Accessibility Validation Suite', () => {
  describe('1. Semantic Document Structure & Heading Hierarchy', () => {
    it('enforces natural heading descent: h1 (module) -> h2 (page view)', () => {
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

      // Level 1 heading belongs to module shell
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Kynergy Intelligence');

      // Level 2 heading belongs to subview header
      const h2Elements = screen.getAllByRole('heading', { level: 2 });
      expect(
        h2Elements.some((h) => h.textContent?.includes('Asistente Conversacional Kynergy')),
      ).toBe(true);
    });

    it('renders assistant markdown headings starting at h3 to prevent collision with page headings', () => {
      const markdownSample = `
# Sección Primaria del Mensaje
Contenido introductorio.

## Subsección Clínica
Detalle del protocolo.

### Pauta Específica
Indicación de tratamiento.
`;

      render(<MarkdownRenderer content={markdownSample} />);

      // In MarkdownRenderer: # becomes h3, ## becomes h4, ### becomes h5
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        'Sección Primaria del Mensaje',
      );
      expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Subsección Clínica');
      expect(screen.getByRole('heading', { level: 5 })).toHaveTextContent('Pauta Específica');

      // No h1 or h2 should be emitted inside assistant prose
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    });

    it('renders RecentDocumentsList as a semantic list (ul/li) for screen reader navigability', () => {
      const mockDocs: KnowledgeDocumentItem[] = [
        {
          id: 'doc-a11y-1',
          title: 'Guía Cervical 2026',
          currentVersionId: 'v1',
          uploadedBy: 'Dr. Test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          visibilityScope: 'CLINICAL_STAFF',
          versionNumber: 1,
          ingestionStatus: 'READY',
          versions: [],
        },
      ];

      renderWithFullProviders(<RecentDocumentsList documents={mockDocs} />);

      const list = screen.getByRole('list', { name: /lista de documentos recientes/i });
      expect(list).toBeInTheDocument();

      const items = screen.getAllByRole('listitem');
      expect(items.length).toBe(1);
    });
  });

  describe('2. Accessible Names on Interactive Controls', () => {
    it('ensures all icon-only buttons in ChatWorkspace have accessible names', async () => {
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

      // Mobile drawer toggle
      expect(
        await screen.findByRole('button', { name: /abrir panel de conversaciones/i }),
      ).toBeInTheDocument();

      // Send button
      expect(screen.getByRole('button', { name: /enviar mensaje/i })).toBeInTheDocument();
    });

    it('ensures CodeBlock copy button has accessible names and keyboard-focusable pre element', () => {
      render(<CodeBlock code="const a = 10;" language="typescript" />);

      const copyBtn = screen.getByRole('button', { name: /copiar código al portapapeles/i });
      expect(copyBtn).toBeInTheDocument();

      // Scrollable pre element must have tabIndex=0 for keyboard accessibility
      const pre = screen
        .getByRole('region', { name: /bloque de typescript/i })
        .querySelector('pre');
      expect(pre).toHaveAttribute('tabindex', '0');
    });

    it('ensures CitationBadge has descriptive screen-reader announcement with index and document info', () => {
      const mockCitation: RAGSourceCitationDto = {
        citationId: 'cit-a11y-001',
        documentId: 'doc-a11y-001',
        documentTitle: 'Manual de Fisioterapia Respiratoria',
        pageNumber: 12,
        chunkId: 'chk-1',
        relevanceScore: 0.95,
      };

      render(<CitationBadge source={mockCitation} index={0} />);

      const badgeBtn = screen.getByRole('button', {
        name: 'Fuente 1: Manual de Fisioterapia Respiratoria, p.12',
      });
      expect(badgeBtn).toBeInTheDocument();
      expect(badgeBtn).toHaveAttribute('type', 'button');
    });
  });

  describe('3. Form Validation & Programmatic Error Associations', () => {
    it('associates aria-invalid and aria-describedby on chat header rename validation error', async () => {
      renderWithFullProviders(
        <ChatWorkspaceHeader
          title="Consulta Cervical"
          conversationId="conv-123"
          isNewThread={false}
          onRename={jest.fn()}
        />,
      );

      // Locate rename button and trigger edit mode
      const renameBtn = await screen.findByRole('button', {
        name: /renombrar conversación actual/i,
      });
      fireEvent.click(renameBtn);

      const input = screen.getByTestId('header-rename-input');
      expect(input).toHaveAttribute('aria-label', 'Editar título de la conversación');
      expect(input).not.toHaveAttribute('aria-invalid', 'true');

      // Clear input and submit empty title to trigger validation error
      fireEvent.change(input, { target: { value: '' } });
      const saveBtn = screen.getByTestId('header-save-rename-button');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('aria-describedby', 'header-rename-error');
      });

      const errorAlert = screen.getByTestId('header-rename-error');
      expect(errorAlert).toHaveAttribute('role', 'alert');
      expect(errorAlert).toHaveTextContent('El título no puede estar vacío');
    });
  });

  describe('4. Dynamic Content, Live Regions & Restrained Telemetry', () => {
    it('maintains a restrained generation live region without noisy token updates', () => {
      renderWithFullProviders(<ChatWorkspace />);

      const liveRegion = screen.getByTestId('generation-live-region');
      expect(liveRegion).toHaveAttribute('role', 'status');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
      expect(liveRegion).toHaveClass('sr-only');
    });
  });

  describe('5. Dialogs, Drawers & Focus Restoration', () => {
    it('renders SourceDetailsDrawer with full accessible dialog semantics and descriptions', () => {
      const mockCitation: RAGSourceCitationDto = {
        citationId: 'cit-drawer-001',
        documentId: 'doc-drawer-001',
        documentTitle: 'Guía Clínica de Movilización',
        pageNumber: 5,
        chunkId: 'chk-5',
        relevanceScore: 0.91,
      };

      renderWithFullProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          citation={mockCitation}
          citationIndex={0}
        />,
      );

      const drawer = screen.getByTestId('source-details-drawer');
      expect(drawer).toHaveAttribute('role', 'dialog');
      expect(drawer).toHaveAttribute('aria-modal', 'true');
      expect(drawer).toHaveAttribute('aria-labelledby', 'source-details-title');
      expect(drawer).toHaveAttribute('aria-describedby', 'source-details-description');
    });

    it('renders DeleteConversationDialog with alertdialog/dialog semantics and accessible description', () => {
      renderWithFullProviders(
        <DeleteConversationDialog
          open={true}
          onOpenChange={jest.fn()}
          conversationTitle="Conversación de Prueba"
          onConfirm={jest.fn()}
        />,
      );

      const dialog = screen.getByTestId('delete-conversation-dialog');
      expect(dialog).toHaveAttribute('role', 'dialog');
      expect(screen.getByText('¿Eliminar conversación?')).toBeInTheDocument();
      expect(screen.getByText(/esta acción archivará la conversación/i)).toBeInTheDocument();
    });
  });

  describe('6. Automated WCAG 2.2 AA Accessibility Audits (jest-axe)', () => {
    it('passes automated WCAG accessibility checks on UserMessage', async () => {
      const mockUserMsg: ChatMessage = {
        id: 'msg-u1',
        role: 'user',
        content: '¿Cuáles son las pautas de tratamiento para lumbalgia aguda?',
        createdAt: new Date().toISOString(),
        status: 'success',
      };

      const { container } = render(<UserMessage message={mockUserMsg} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated WCAG accessibility checks on AssistantMessage with Markdown table and code', async () => {
      const mockAssistantMsg: ChatMessage = {
        id: 'msg-a1',
        role: 'assistant',
        content: `A continuación se detallan las pautas recomendadas:

| Fase | Intervención | Duración |
| :--- | :--- | :--- |
| Aguda | Reposo relativo y analgesia | 48-72 h |
| Subaguda | Movilización pasiva precoz | 1-2 semanas |

\`\`\`typescript
const protocolId = "LUMB-01";
\`\`\`
`,
        createdAt: new Date().toISOString(),
        status: 'success',
        grounded: true,
      };

      const { container } = render(
        <QueryClientProvider client={createTestQueryClient()}>
          <AssistantMessage message={mockAssistantMsg} />
        </QueryClientProvider>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated WCAG accessibility checks on KnowledgeLibraryToolbar', async () => {
      const { container } = renderWithFullProviders(
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

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
