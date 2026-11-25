import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SourceDetailsDrawer } from '../components/source-details-drawer';
import type { RAGSourceCitationDto } from '../types/assistant.types';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AI-09.4-CIT.05 — Source Details Drawer & Excerpt Rendering', () => {
  const mockClipboard = {
    writeText: jest.fn().mockImplementation(() => Promise.resolve()),
  };

  beforeAll(() => {
    Object.assign(navigator, {
      clipboard: mockClipboard,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleCitation1: RAGSourceCitationDto = {
    citationId: 'cite-001',
    documentId: 'doc-knee-101',
    documentTitle: 'Guía Clínica de Rehabilitación Meniscal y Ligamentosa',
    originalFileName: 'guia-meniscal-2026.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 2097152, // 2.0 MB
    documentVersionId: 'ver-101',
    documentVersionNumber: 2,
    chunkId: 'chunk-men-42',
    excerpt:
      'En la fase aguda posterior a la meniscectomía parcial, la prioridad clínica inicial es la recuperación de la extensión pasiva completa.\n\nSe recomienda movilización precoz combinada con crioterapia intermitente.',
    pageNumber: 22,
    headingPath: ['Fase Aguda', 'Control de Edema', 'Crioterapia'],
    relevanceScore: 0.95,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_AVAILABLE',
    canPreview: true,
  };

  const sampleCitation2: RAGSourceCitationDto = {
    citationId: 'cite-002',
    documentId: 'doc-archived-202',
    documentTitle: 'Tratado Histórico de Fisioterapia Convencional',
    originalFileName: 'tratado-historico.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1048576, // 1.0 MB
    chunkId: 'chunk-hist-07',
    excerpt: 'El reposo prolongado en cama solía ser recomendado antes de la era activa.',
    pageNumber: 15,
    headingPath: ['Capítulo 1', 'Historia'],
    relevanceScore: 0.78,
    retrievalRank: 2,
    sourceStrategy: 'KEYWORD',
    previewStatus: 'DOCUMENT_SOFT_DELETED',
    canPreview: false,
    previewUnavailableReason: 'El documento original ha sido archivado o eliminado.',
  };

  const sampleCitation3: RAGSourceCitationDto = {
    citationId: 'cite-003',
    documentId: 'doc-restricted-303',
    documentTitle: 'Protocolo de Ensayos Farmacológicos Especiales',
    chunkId: 'chunk-farm-99',
    excerpt: 'El uso de agentes antiinflamatorios no esteroideos debe monitorizarse semanalmente.',
    relevanceScore: 0.89,
    retrievalRank: 3,
    sourceStrategy: 'SEMANTIC',
    previewStatus: 'DOCUMENT_RESTRICTED',
    canPreview: false,
    previewUnavailableReason: 'Acceso restringido para el rol clínico actual.',
  };

  describe('1. Drawer Lifecycle & Accessibility', () => {
    it('does not render when isOpen is false', () => {
      const { container } = renderWithProviders(
        <SourceDetailsDrawer isOpen={false} onClose={jest.fn()} citation={sampleCitation1} />,
      );
      expect(container.firstChild).toBeNull();
      expect(screen.queryByTestId('source-details-drawer')).not.toBeInTheDocument();
    });

    it('does not render when citation is null even if isOpen is true', () => {
      const { container } = renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={null} />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders with accessible role, title, and aria attributes when open', () => {
      renderWithProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          citation={sampleCitation1}
          citationIndex={0}
        />,
      );

      const drawer = screen.getByTestId('source-details-drawer');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveAttribute('role', 'dialog');
      expect(drawer).toHaveAttribute('aria-modal', 'true');
      expect(drawer).toHaveAttribute('aria-labelledby', 'source-details-title');

      expect(screen.getByText('Detalles de la fuente')).toBeInTheDocument();
      expect(screen.getByText('[1]')).toBeInTheDocument();
    });

    it('invokes onClose when clicking close button', () => {
      const onClose = jest.fn();
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={onClose} citation={sampleCitation1} />,
      );

      const closeBtn = screen.getByTestId('close-drawer-btn');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when clicking the backdrop', () => {
      const onClose = jest.fn();
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={onClose} citation={sampleCitation1} />,
      );

      const backdrop = screen.getByTestId('source-details-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('invokes onClose when pressing Escape key', () => {
      const onClose = jest.fn();
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={onClose} citation={sampleCitation1} />,
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Document Identity & File Metadata', () => {
    it('renders document title, filename, MIME type badge, size, and version number', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation1} />,
      );

      expect(screen.getByTestId('drawer-document-title')).toHaveTextContent(
        'Guía Clínica de Rehabilitación Meniscal y Ligamentosa',
      );
      expect(screen.getByText('guia-meniscal-2026.pdf')).toBeInTheDocument();
      expect(screen.getByText('PDF')).toBeInTheDocument();
      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('Activo')).toBeInTheDocument();
    });

    it('handles missing filename, MIME type, and version number without crashing', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation3} />,
      );

      expect(screen.getByTestId('drawer-document-title')).toHaveTextContent(
        'Protocolo de Ensayos Farmacológicos Especiales',
      );
      expect(screen.queryByText(/MB/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    });
  });

  describe('3. Location & Hierarchy Breadcrumbs', () => {
    it('renders page number badge and hierarchical heading path', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation1} />,
      );

      expect(screen.getByText('Página 22')).toBeInTheDocument();
      expect(screen.getByText('Fase Aguda')).toBeInTheDocument();
      expect(screen.getByText('Control de Edema')).toBeInTheDocument();
      expect(screen.getByText('Crioterapia')).toBeInTheDocument();
    });

    it('renders fallback notice when page number and heading path are missing', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation3} />,
      );

      expect(screen.getByText('Sin número de página')).toBeInTheDocument();
      expect(screen.getByText(/sin encabezados jerárquicos/i)).toBeInTheDocument();
    });
  });

  describe('4. Verbatim Evidence Excerpt & Security', () => {
    it('renders verbatim excerpt preserving paragraph structure and whitespace', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation1} />,
      );

      const excerptContainer = screen.getByTestId('drawer-verbatim-excerpt');
      expect(excerptContainer).toBeInTheDocument();
      expect(excerptContainer).toHaveTextContent(
        'En la fase aguda posterior a la meniscectomía parcial, la prioridad clínica inicial es la recuperación de la extensión pasiva completa.',
      );
      expect(excerptContainer).toHaveTextContent(
        'Se recomienda movilización precoz combinada con crioterapia intermitente.',
      );
      expect(excerptContainer).toHaveClass('whitespace-pre-wrap');
    });

    it('sanitizes untrusted text and prevents script/HTML execution', () => {
      const maliciousCitation: RAGSourceCitationDto = {
        ...sampleCitation1,
        excerpt: '<script>alert("xss")</script><b>Texto en negrita no interpretado</b>',
      };

      const { container } = renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={maliciousCitation} />,
      );

      // Verify no script tag was inserted into DOM
      expect(container.querySelector('script')).toBeNull();
      // Verify text is safely escaped and rendered literally
      expect(screen.getByTestId('drawer-verbatim-excerpt')).toHaveTextContent(
        '<script>alert("xss")</script><b>Texto en negrita no interpretado</b>',
      );
    });

    it('copies excerpt to clipboard when copy button is clicked', async () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation1} />,
      );

      const copyBtn = screen.getByTestId('copy-excerpt-btn');
      expect(copyBtn).toHaveTextContent('Copiar');

      fireEvent.click(copyBtn);

      expect(mockClipboard.writeText).toHaveBeenCalledWith(sampleCitation1.excerpt);
      await waitFor(() => {
        expect(screen.getByText('Copiado')).toBeInTheDocument();
      });
    });
  });

  describe('5. Dynamic Document Status & Preview Actions', () => {
    it('enables full document preview when DOCUMENT_AVAILABLE', () => {
      const onPreviewDocument = jest.fn();
      renderWithProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          citation={sampleCitation1}
          onPreviewDocument={onPreviewDocument}
        />,
      );

      const previewBtn = screen.getByTestId('open-full-document-btn');
      expect(previewBtn).toBeInTheDocument();
      expect(previewBtn).toBeEnabled();

      fireEvent.click(previewBtn);
      expect(onPreviewDocument).toHaveBeenCalledWith('doc-knee-101', 22, 'cite-001', undefined);
    });

    it('renders archive alert banner and disables preview when DOCUMENT_SOFT_DELETED', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation2} />,
      );

      expect(screen.getByText('Archivado')).toBeInTheDocument();
      expect(
        screen.getByText(/El documento original ha sido archivado o eliminado/i),
      ).toBeInTheDocument();
      expect(screen.getByText('Vista previa no disponible')).toBeInTheDocument();
      expect(screen.queryByTestId('open-full-document-btn')).not.toBeInTheDocument();
    });

    it('renders role restriction alert and disables preview when DOCUMENT_RESTRICTED', () => {
      renderWithProviders(
        <SourceDetailsDrawer isOpen={true} onClose={jest.fn()} citation={sampleCitation3} />,
      );

      expect(screen.getByText('Restringido')).toBeInTheDocument();
      expect(
        screen.getByText(/Acceso restringido para el rol clínico actual/i),
      ).toBeInTheDocument();
      expect(screen.getByText('Vista previa no disponible')).toBeInTheDocument();
      expect(screen.queryByTestId('open-full-document-btn')).not.toBeInTheDocument();
    });
  });

  describe('6. Cycling Across Multiple Citations', () => {
    it('supports cycling through citations with previous and next buttons', () => {
      const allCitations = [sampleCitation1, sampleCitation2, sampleCitation3];
      const onSelectCitation = jest.fn();

      const { rerender } = renderWithProviders(
        <SourceDetailsDrawer
          isOpen={true}
          onClose={jest.fn()}
          citation={sampleCitation1}
          citationIndex={0}
          allCitations={allCitations}
          onSelectCitation={onSelectCitation}
        />,
      );

      expect(screen.getByText('1/3')).toBeInTheDocument();
      const prevBtn = screen.getByTestId('prev-citation-btn');
      const nextBtn = screen.getByTestId('next-citation-btn');

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      fireEvent.click(nextBtn);
      expect(onSelectCitation).toHaveBeenCalledWith(sampleCitation2, 1);

      // Rerender with citation 2
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <SourceDetailsDrawer
            isOpen={true}
            onClose={jest.fn()}
            citation={sampleCitation2}
            citationIndex={1}
            allCitations={allCitations}
            onSelectCitation={onSelectCitation}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText('2/3')).toBeInTheDocument();
      expect(screen.getByTestId('prev-citation-btn')).toBeEnabled();
      expect(screen.getByTestId('next-citation-btn')).toBeEnabled();
    });
  });
});
