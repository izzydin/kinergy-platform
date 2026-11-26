import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { IngestionLifecycleTimeline } from '../components/ingestion-lifecycle-timeline';
import type { IngestionJobItem, IngestionRetrievalStatus } from '../types/knowledge-contract.types';

describe('IM.03 — IngestionLifecycleTimeline', () => {
  const baseJob: IngestionJobItem = {
    id: 'job_test_001',
    documentId: 'doc_123',
    documentVersionId: 'ver_1',
    versionNumber: 1,
    status: 'READY',
    attemptCount: 1,
    maxAttempts: 3,
    startedAt: '2026-11-26T10:00:00.000Z',
    completedAt: '2026-11-26T10:00:15.500Z',
    durationMs: 15500,
    isTerminal: true,
    canRetry: false,
    createdAt: '2026-11-26T10:00:00.000Z',
    stages: [
      {
        stage: 'VALIDATING',
        status: 'COMPLETED',
        order: 1,
        startedAt: '2026-11-26T10:00:00.000Z',
        completedAt: '2026-11-26T10:00:01.000Z',
        durationMs: 1000,
      },
      {
        stage: 'PROCESSING',
        status: 'COMPLETED',
        order: 2,
        startedAt: '2026-11-26T10:00:01.000Z',
        completedAt: '2026-11-26T10:00:08.000Z',
        durationMs: 7000,
        metrics: {
          totalChunks: 24,
        },
      },
      {
        stage: 'INDEXING',
        status: 'COMPLETED',
        order: 3,
        startedAt: '2026-11-26T10:00:08.000Z',
        completedAt: '2026-11-26T10:00:15.500Z',
        durationMs: 7500,
        metrics: {
          embeddedChunks: 24,
        },
      },
    ],
  };

  const baseRetrievalStatus: IngestionRetrievalStatus = {
    documentId: 'doc_123',
    isReadyForRetrieval: true,
    overallReady: true,
    hasActiveIndexGeneration: true,
    isDocumentActive: true,
    chunksPersisted: true,
    embeddingsCommitted: true,
    activeGenerationId: 'gen_active_2026',
    reasons: [],
    evaluatedAt: '2026-11-26T10:01:00.000Z',
  };

  // =========================================================================
  // 1. Loading & Error States
  // =========================================================================
  it('renders loading skeleton with accessible aria-busy attribute', () => {
    render(<IngestionLifecycleTimeline documentId="doc_123" isLoading={true} />);

    const loadingRegion = screen.getByTestId('ingestion-lifecycle-loading');
    expect(loadingRegion).toBeInTheDocument();
    expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    expect(loadingRegion).toHaveAttribute('aria-label', 'Cargando ciclo de vida de ingesta');
  });

  it('renders error state with retry button when backend query fails', () => {
    const onRefresh = jest.fn();
    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        error={new Error('Network connection timeout')}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByTestId('ingestion-lifecycle-error')).toBeInTheDocument();
    expect(
      screen.getByText('No se pudo cargar la información de ciclo de vida'),
    ).toBeInTheDocument();
    expect(screen.getByText('Network connection timeout')).toBeInTheDocument();

    const retryBtn = screen.getByTestId('retry-fetch-lifecycle-button');
    fireEvent.click(retryBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders empty state when no ingestion jobs exist', () => {
    render(<IngestionLifecycleTimeline documentId="doc_123" job={null} />);

    expect(screen.getByTestId('ingestion-lifecycle-empty')).toBeInTheDocument();
    expect(screen.getByText('Sin registros de ingesta')).toBeInTheDocument();
  });

  // =========================================================================
  // 2. Authoritative Backend Statuses & Safe Unknown Fallback
  // =========================================================================
  it.each([
    ['READY', 'Indexado'],
    ['INDEXING', 'Indexando'],
    ['PROCESSING', 'Procesando'],
    ['VALIDATING', 'Validando'],
    ['UPLOADED', 'En cola'],
    ['FAILED', 'Error'],
    ['CANCELLED', 'Cancelado'],
  ] as const)('renders authoritative backend status %s correctly', (status, expectedLabel) => {
    const job: IngestionJobItem = {
      ...baseJob,
      status,
    };

    render(<IngestionLifecycleTimeline documentId="doc_123" job={job} />);

    const badge = screen.getByTestId(`ingestion-status-${status.toLowerCase()}`);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(expectedLabel);
  });

  it('safely handles unknown backend status without crashing or assuming success', () => {
    const unknownJob: IngestionJobItem = {
      ...baseJob,
      status: 'FUTURE_QUEUED_STATE' as unknown as IngestionJobItem['status'],
    };

    render(<IngestionLifecycleTimeline documentId="doc_123" job={unknownJob} />);

    // Must render the exact unknown string safely
    const badge = screen.getByTestId('ingestion-status-future_queued_state');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('FUTURE_QUEUED_STATE');
    // Does NOT say "Indexado" or assume success
    expect(screen.queryByText('Indexado')).not.toBeInTheDocument();
  });

  // =========================================================================
  // 3. Stage Breakdown, Chronological Ordering, and Metrics
  // =========================================================================
  it('renders deterministic chronological stages with authentic metrics', () => {
    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={baseJob}
        retrievalStatus={baseRetrievalStatus}
      />,
    );

    expect(screen.getByTestId('stages-timeline-list')).toBeInTheDocument();
    expect(screen.getByTestId('stage-item-validating')).toBeInTheDocument();
    expect(screen.getByTestId('stage-item-processing')).toBeInTheDocument();
    expect(screen.getByTestId('stage-item-indexing')).toBeInTheDocument();

    // Verify stage status badges
    expect(screen.getByTestId('stage-status-badge-validating')).toHaveTextContent('Completado');
    expect(screen.getByTestId('stage-status-badge-processing')).toHaveTextContent('Completado');
    expect(screen.getByTestId('stage-status-badge-indexing')).toHaveTextContent('Completado');

    // Verify authentic metrics (no fabricated percentages)
    expect(screen.getByText('Fragmentos: 24')).toBeInTheDocument();
    expect(screen.getByText('Vectorizados: 24')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-duration')).toHaveTextContent('15.5 s');
    expect(screen.getByText('Duración: 7.5 s')).toBeInTheDocument();
  });

  it('honestly handles legacy jobs without granular stages', () => {
    const legacyJob: IngestionJobItem = {
      ...baseJob,
      stages: undefined,
    };

    render(<IngestionLifecycleTimeline documentId="doc_123" job={legacyJob} />);

    expect(screen.getByTestId('legacy-aggregate-stages-notice')).toBeInTheDocument();
    expect(
      screen.getByText(/El backend expone un estado consolidado para este registro/i),
    ).toBeInTheDocument();
  });

  it('displays in-progress stage with live spinner and accessible status', () => {
    const inFlightJob: IngestionJobItem = {
      ...baseJob,
      status: 'PROCESSING',
      stages: [
        {
          stage: 'VALIDATING',
          status: 'COMPLETED',
          order: 1,
          startedAt: '2026-11-26T10:00:00.000Z',
          completedAt: '2026-11-26T10:00:01.000Z',
        },
        {
          stage: 'PROCESSING',
          status: 'IN_PROGRESS',
          order: 2,
          startedAt: '2026-11-26T10:00:01.000Z',
        },
        {
          stage: 'INDEXING',
          status: 'PENDING',
          order: 3,
        },
      ],
    };

    render(<IngestionLifecycleTimeline documentId="doc_123" job={inFlightJob} />);

    expect(screen.getByText('En ejecución')).toBeInTheDocument();
    expect(screen.getByTestId('stage-status-badge-processing')).toHaveTextContent('En progreso');
    expect(screen.getByTestId('stage-status-badge-indexing')).toHaveTextContent('Pendiente');
  });

  // =========================================================================
  // 4. Retrieval Availability Distinction
  // =========================================================================
  it('distinguishes successful ingestion from actual RAG retrieval availability', () => {
    // Ingestion READY, but retrieval is NOT ready (e.g. index generation not switched)
    const notReadyRetrieval: IngestionRetrievalStatus = {
      documentId: 'doc_123',
      isReadyForRetrieval: false,
      overallReady: false,
      hasActiveIndexGeneration: false,
      isDocumentActive: true,
      chunksPersisted: true,
      embeddingsCommitted: false,
      reasons: ['No active IndexGeneration found for tenant.'],
      evaluatedAt: '2026-11-26T10:01:00.000Z',
    };

    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={baseJob}
        retrievalStatus={notReadyRetrieval}
      />,
    );

    // Ingestion badge says "Indexado"
    expect(screen.getByTestId('ingestion-status-ready')).toHaveTextContent('Indexado');

    // Retrieval readiness badge clearly says "No disponible en RAG"
    expect(screen.getByTestId('retrieval-not-ready-badge')).toHaveTextContent(
      'No disponible en RAG',
    );
    expect(screen.getByTestId('retrieval-reasons-list')).toHaveTextContent(
      'No active IndexGeneration found for tenant.',
    );
  });

  it('shows green retrieval badge when all invariants pass', () => {
    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={baseJob}
        retrievalStatus={baseRetrievalStatus}
      />,
    );

    expect(screen.getByTestId('retrieval-ready-badge')).toHaveTextContent('Disponible en RAG');
    expect(screen.getByText('gen_active_2026')).toBeInTheDocument();
  });

  // =========================================================================
  // 5. Safe Failure & Cancellation Presentation
  // =========================================================================
  it('displays sanitized failure details, failure category, and retry trigger', () => {
    const onRetry = jest.fn();
    const failedJob: IngestionJobItem = {
      ...baseJob,
      status: 'FAILED',
      canRetry: true,
      failureInfo: {
        code: 'PARSING_MALFORMED_PDF',
        category: 'PARSING',
        message: 'No se pudo extraer texto debido a estructura PDF corrupta.',
        isTransient: false,
        canRetry: true,
      },
    };

    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={failedJob}
        canManage={true}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('ingestion-failure-box')).toBeInTheDocument();
    expect(screen.getByText('Error de Extracción de Texto')).toBeInTheDocument();
    expect(screen.getByText('Código: PARSING_MALFORMED_PDF')).toBeInTheDocument();
    expect(
      screen.getByText('No se pudo extraer texto debido a estructura PDF corrupta.'),
    ).toBeInTheDocument();

    const retryBtn = screen.getByTestId('lifecycle-retry-button');
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('displays cancellation timestamp and reason when cancelled', () => {
    const cancelledJob: IngestionJobItem = {
      ...baseJob,
      status: 'CANCELLED',
      cancelledAt: '2026-11-26T10:05:00.000Z',
      cancellationReason: 'Cancelado por solicitud del operador clínico',
    };

    render(<IngestionLifecycleTimeline documentId="doc_123" job={cancelledJob} />);

    expect(screen.getByTestId('ingestion-cancellation-box')).toBeInTheDocument();
    expect(screen.getByText('Cancelado por solicitud del operador clínico')).toBeInTheDocument();
  });

  // =========================================================================
  // 6. Interactive Actions & Accessibility
  // =========================================================================
  it('triggers refresh and cancel actions appropriately', () => {
    const onRefresh = jest.fn();
    const onCancel = jest.fn();

    const inFlightJob: IngestionJobItem = {
      ...baseJob,
      status: 'INDEXING',
    };

    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={inFlightJob}
        canManage={true}
        onRefresh={onRefresh}
        onCancel={onCancel}
      />,
    );

    const refreshBtn = screen.getByTestId('refresh-lifecycle-button');
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByTestId('lifecycle-cancel-button');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('conforms to accessible semantics and screen-reader requirements', () => {
    render(
      <IngestionLifecycleTimeline
        documentId="doc_123"
        job={baseJob}
        retrievalStatus={baseRetrievalStatus}
      />,
    );

    const section = screen.getByTestId('ingestion-lifecycle-section');
    expect(section).toHaveAttribute('aria-label', 'Línea de tiempo del ciclo de vida de ingesta');

    const timelineList = screen.getByTestId('stages-timeline-list');
    expect(timelineList.tagName.toLowerCase()).toBe('ol');
  });
});
