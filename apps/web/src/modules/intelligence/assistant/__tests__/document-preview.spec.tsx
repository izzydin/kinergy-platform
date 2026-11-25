import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentPreview } from '../components/document-preview';
import { conversationApi } from '../api/conversation.api';
import type { CitationPreviewResponse } from '../types/conversation-contract.types';

jest.mock('../api/conversation.api');

const mockConversationApi = jest.mocked(conversationApi);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AI-09.4-CIT.06 — DocumentPreview Component', () => {
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

  const pdfPreviewResponse: CitationPreviewResponse = {
    documentId: 'doc-pdf-1',
    citationId: 'cite-pdf-1',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    documentTitleSnapshot: 'Guía Clínica de Rehabilitación Meniscal',
    documentTitle: 'Guía Clínica de Rehabilitación Meniscal',
    originalFileName: 'guia-meniscal-2026.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 2097152, // 2.0 MB
    documentVersionId: 'v1',
    documentVersionNumber: 1,
    pageNumber: 14,
    headingPath: ['Protocolo Postquirúrgico', 'Semana 1-2'],
    excerpt: 'La crioterapia debe aplicarse durante 20 minutos cada 2 horas.',
    canPreview: true,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_AVAILABLE',
    downloadAllowed: true,
    previewToken: 'test-hmac-token-123',
    previewUrl:
      '/api/v1/ai/conversations/conv-1/messages/msg-1/citations/cite-pdf-1/content?token=test-hmac-token-123',
  };

  const textPreviewResponse: CitationPreviewResponse = {
    documentId: 'doc-txt-2',
    citationId: 'cite-txt-2',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    documentTitleSnapshot: 'Notas de Triage',
    documentTitle: 'Notas de Triage',
    originalFileName: 'triage-notes.txt',
    mimeType: 'text/plain',
    fileSizeBytes: 512,
    documentVersionId: 'v1',
    documentVersionNumber: 1,
    pageNumber: null,
    headingPath: [],
    excerpt: 'Paciente refiere dolor lumbar agudo tras esfuerzo físico.',
    canPreview: true,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_AVAILABLE',
    downloadAllowed: true,
    previewToken: 'test-hmac-token-txt',
    previewUrl:
      '/api/v1/ai/conversations/conv-1/messages/msg-1/citations/cite-txt-2/content?token=test-hmac-token-txt',
  };

  const unsupportedPreviewResponse: CitationPreviewResponse = {
    documentId: 'doc-docx-3',
    citationId: 'cite-docx-3',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    documentTitleSnapshot: 'Especificación Técnica',
    documentTitle: 'Especificación Técnica',
    originalFileName: 'especificacion.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSizeBytes: 1048576,
    documentVersionId: 'v1',
    documentVersionNumber: 1,
    pageNumber: null,
    headingPath: [],
    excerpt: 'Extracto de la especificación técnica en Word.',
    canPreview: false,
    supportedFormat: false,
    previewStatus: 'UNSUPPORTED_FORMAT',
    previewUnavailableReason:
      'El formato (application/vnd.openxmlformats-officedocument.wordprocessingml.document) no admite previsualización directa en el navegador.',
    downloadAllowed: true,
    previewToken: null,
    previewUrl: '/api/v1/ai/conversations/conv-1/messages/msg-1/citations/cite-docx-3/content',
  };

  const restrictedPreviewResponse: CitationPreviewResponse = {
    documentId: 'doc-sec-4',
    citationId: 'cite-sec-4',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    documentTitleSnapshot: 'Auditoría Confidencial',
    documentTitle: 'Auditoría Confidencial',
    originalFileName: 'auditoria-privada.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 500000,
    documentVersionId: 'v1',
    documentVersionNumber: 1,
    pageNumber: 3,
    headingPath: ['Finanzas'],
    excerpt: 'Datos reservados de la auditoría interna.',
    canPreview: false,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_RESTRICTED',
    previewUnavailableReason: 'Acceso restringido: requiere rol de Director o Administrador.',
    downloadAllowed: false,
    previewToken: null,
    previewUrl: '',
  };

  const deletedPreviewResponse: CitationPreviewResponse = {
    documentId: 'doc-del-5',
    citationId: 'cite-del-5',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    documentTitleSnapshot: 'Manual Obsoleto',
    documentTitle: 'Manual Obsoleto',
    originalFileName: 'manual-2015.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 300000,
    documentVersionId: 'v1',
    documentVersionNumber: 1,
    pageNumber: 5,
    headingPath: [],
    excerpt: 'Manual desactualizado.',
    canPreview: false,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_DELETED',
    previewUnavailableReason:
      'El documento original ha sido archivado o eliminado del almacenamiento.',
    downloadAllowed: false,
    previewToken: null,
    previewUrl: '',
  };

  it('1. does not render anything when isOpen is false', () => {
    const { container } = renderWithProviders(
      <DocumentPreview
        isOpen={false}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('2. renders loading state while preview metadata is resolving', () => {
    mockConversationApi.getCitationPreview.mockReturnValue(new Promise(() => {}));

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    expect(screen.getByTestId('preview-loading')).toBeInTheDocument();
    expect(screen.getByText(/Verificando autorización/i)).toBeInTheDocument();
  });

  it('3. renders PDF preview with page navigation and zoom controls', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(pdfPreviewResponse);
    mockConversationApi.getCitationDocumentContentUrl.mockReturnValue(
      '/api/v1/ai/conversations/conv-1/messages/msg-1/citations/cite-pdf-1/content?token=test-hmac-token-123',
    );

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-ready')).toBeInTheDocument();
    });

    // Check title and metadata
    expect(screen.getByText('Guía Clínica de Rehabilitación Meniscal')).toBeInTheDocument();
    expect(screen.getByText(/Página citada: 14/i)).toBeInTheDocument();
    expect(screen.getByText('guia-meniscal-2026.pdf')).toBeInTheDocument();

    // Check PDF iframe
    const iframe = screen.getByTestId('pdf-preview-iframe') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain('#page=14&zoom=100');

    // Page navigation: Next page
    const nextBtn = screen.getByTestId('pdf-next-page-btn');
    fireEvent.click(nextBtn);
    expect(iframe.src).toContain('#page=15&zoom=100');

    // Page navigation: Previous page
    const prevBtn = screen.getByTestId('pdf-prev-page-btn');
    fireEvent.click(prevBtn);
    expect(iframe.src).toContain('#page=14&zoom=100');

    // Jump to cited page badge
    const citedBadge = screen.getByTestId('cited-page-badge');
    fireEvent.click(nextBtn);
    expect(iframe.src).toContain('#page=15');
    fireEvent.click(citedBadge);
    expect(iframe.src).toContain('#page=14');

    // Zoom controls
    const zoomIndicator = screen.getByTestId('pdf-zoom-indicator');
    expect(zoomIndicator).toHaveTextContent('100%');

    const zoomInBtn = screen.getByTestId('pdf-zoom-in-btn');
    fireEvent.click(zoomInBtn);
    expect(zoomIndicator).toHaveTextContent('125%');
    expect(iframe.src).toContain('#page=14&zoom=125');

    const zoomOutBtn = screen.getByTestId('pdf-zoom-out-btn');
    fireEvent.click(zoomOutBtn);
    expect(zoomIndicator).toHaveTextContent('100%');

    const zoomResetBtn = screen.getByTestId('pdf-zoom-reset-btn');
    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomInBtn);
    expect(zoomIndicator).toHaveTextContent('150%');
    fireEvent.click(zoomResetBtn);
    expect(zoomIndicator).toHaveTextContent('100%');
  });

  it('4. renders plain text content when mimeType is text/plain', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(textPreviewResponse);
    mockConversationApi.getCitationDocumentContentText.mockResolvedValueOnce(
      'Paciente refiere dolor lumbar agudo tras esfuerzo físico prolongado.',
    );

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-txt-2"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-ready')).toBeInTheDocument();
    });

    expect(screen.getByText('Notas de Triage')).toBeInTheDocument();
    expect(
      screen.getByText(/Paciente refiere dolor lumbar agudo tras esfuerzo físico prolongado./i),
    ).toBeInTheDocument();
  });

  it('5. renders unsupported format state with honest explanation and download option', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(unsupportedPreviewResponse);
    mockConversationApi.getCitationDocumentContentUrl.mockReturnValue(
      '/api/v1/ai/conversations/conv-1/messages/msg-1/citations/cite-docx-3/content',
    );

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-docx-3"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-unsupported')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Previsualización no disponible para este formato/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('especificacion.docx').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('preview-download-btn')).toBeInTheDocument();
  });

  it('6. renders restricted state when user lacks authorization', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(restrictedPreviewResponse);

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-sec-4"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-unauthorized')).toBeInTheDocument();
    });

    expect(screen.getByText('Acceso Restringido')).toBeInTheDocument();
    expect(
      screen.getByText(/Acceso restringido: requiere rol de Director o Administrador/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('preview-ready')).toBeNull();
  });

  it('7. renders deleted document state when document is soft deleted or archived', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(deletedPreviewResponse);

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-del-5"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-deleted')).toBeInTheDocument();
    });

    expect(screen.getByText('Documento No Disponible')).toBeInTheDocument();
    expect(
      screen.getByText(/El documento original ha sido archivado o eliminado del almacenamiento/i),
    ).toBeInTheDocument();
  });

  it('8. renders error state with retry button when preview query fails', async () => {
    mockConversationApi.getCitationPreview.mockRejectedValueOnce(
      new Error('Fallo de red al conectar con el servidor.'),
    );

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Error al cargar el documento')).toBeInTheDocument();
    expect(screen.getByText('Fallo de red al conectar con el servidor.')).toBeInTheDocument();
    expect(screen.getByText('Reintentar')).toBeInTheDocument();
  });

  it('9. handles close action via close button and return to chat button', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(pdfPreviewResponse);
    const onClose = jest.fn();

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={onClose}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-ready')).toBeInTheDocument();
    });

    const closeBtn = screen.getByTestId('preview-close-btn');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const returnBtn = screen.getByTestId('preview-return-to-chat-btn');
    fireEvent.click(returnBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('10. handles close on Escape key press', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(pdfPreviewResponse);
    const onClose = jest.fn();

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={onClose}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-ready')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('11. copies citation excerpt to clipboard when copy button is clicked', async () => {
    mockConversationApi.getCitationPreview.mockResolvedValueOnce(pdfPreviewResponse);

    renderWithProviders(
      <DocumentPreview
        isOpen={true}
        onClose={jest.fn()}
        conversationId="conv-1"
        messageId="msg-1"
        citationId="cite-pdf-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview-excerpt-banner')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTitle('Copiar extracto');
    fireEvent.click(copyBtn);

    expect(mockClipboard.writeText).toHaveBeenCalledWith(
      'La crioterapia debe aplicarse durante 20 minutos cada 2 horas.',
    );
    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeInTheDocument();
    });
  });
});
