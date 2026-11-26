import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcessingHistoryDiagnostics } from '../components/processing-history-diagnostics';
import type { IngestionJobItem } from '../types/knowledge-contract.types';

describe('IM.05 — ProcessingHistoryDiagnostics', () => {
  const mockCompletedJob: IngestionJobItem = {
    id: 'job_completed_001',
    documentId: 'doc_123',
    documentVersionId: 'ver_01',
    versionNumber: 1,
    status: 'READY',
    attemptCount: 1,
    maxAttempts: 3,
    startedAt: '2026-11-26T10:00:00.000Z',
    completedAt: '2026-11-26T10:00:14.200Z',
    durationMs: 14200,
    isTerminal: true,
    canRetry: false,
    createdAt: '2026-11-26T10:00:00.000Z',
    stages: [
      { stage: 'VALIDATING', status: 'COMPLETED', label: 'Validación' },
      { stage: 'PROCESSING', status: 'COMPLETED', label: 'Extracción' },
      { stage: 'INDEXING', status: 'COMPLETED', label: 'Indexación' },
    ],
  };

  const mockFailedRetryableJob: IngestionJobItem = {
    id: 'job_failed_002',
    documentId: 'doc_123',
    documentVersionId: 'ver_02',
    versionNumber: 2,
    status: 'FAILED',
    attemptCount: 2,
    maxAttempts: 3,
    startedAt: '2026-11-26T10:30:00.000Z',
    completedAt: '2026-11-26T10:30:05.000Z',
    nextRetryAt: '2026-11-26T10:35:00.000Z',
    durationMs: 5000,
    isTerminal: false,
    canRetry: true,
    lastErrorCode: 'STORAGE_TIMEOUT',
    lastErrorMessage: 'Conexión con el servicio de almacenamiento agotó el tiempo de espera.',
    createdAt: '2026-11-26T10:30:00.000Z',
    failureInfo: {
      code: 'STORAGE_TIMEOUT',
      category: 'STORAGE',
      message: 'Conexión con el servicio de almacenamiento agotó el tiempo de espera.',
      failedStage: 'PROCESSING',
      isRetryable: true,
      canRetry: true,
      attemptNumber: 2,
      failedAt: '2026-11-26T10:30:05.000Z',
    },
    stages: [
      { stage: 'VALIDATING', status: 'COMPLETED', label: 'Validación' },
      { stage: 'PROCESSING', status: 'FAILED', label: 'Extracción' },
      { stage: 'INDEXING', status: 'SKIPPED', label: 'Indexación' },
    ],
  };

  const mockValidationFailedNonRetryableJob: IngestionJobItem = {
    id: 'job_failed_003',
    documentId: 'doc_123',
    documentVersionId: 'ver_03',
    versionNumber: 3,
    status: 'FAILED',
    attemptCount: 3,
    maxAttempts: 3,
    startedAt: '2026-11-26T11:00:00.000Z',
    completedAt: '2026-11-26T11:00:02.000Z',
    durationMs: 2000,
    isTerminal: true,
    canRetry: false,
    lastErrorCode: 'UNSUPPORTED_FORMAT',
    lastErrorMessage: 'El formato de archivo no es compatible para la extracción de texto.',
    createdAt: '2026-11-26T11:00:00.000Z',
    failureInfo: {
      code: 'UNSUPPORTED_FORMAT',
      category: 'VALIDATION',
      message: 'El formato de archivo no es compatible para la extracción de texto.',
      failedStage: 'VALIDATING',
      isRetryable: false,
      canRetry: false,
      attemptNumber: 3,
      failedAt: '2026-11-26T11:00:02.000Z',
    },
  };

  // =========================================================================
  // 1. Loading, Error & Empty States
  // =========================================================================
  it('renders loading skeleton with aria-busy when isLoading is true', () => {
    render(<ProcessingHistoryDiagnostics documentId="doc_123" isLoading={true} />);

    const loadingRegion = screen.getByTestId('processing-history-loading');
    expect(loadingRegion).toBeInTheDocument();
    expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
  });

  it('renders error state with retry action when error occurs', () => {
    const onRefresh = jest.fn();
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        error={new Error('Error de conexión con la API de observabilidad')}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByTestId('processing-history-error')).toBeInTheDocument();
    expect(screen.getByText('Error de conexión con la API de observabilidad')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Reintentar/i });
    fireEvent.click(retryBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders empty history state when no jobs are registered', () => {
    render(<ProcessingHistoryDiagnostics documentId="doc_123" jobs={[]} />);

    expect(screen.getByTestId('processing-history-empty')).toBeInTheDocument();
    expect(screen.getByText('Sin historial de procesamiento registrado')).toBeInTheDocument();
  });

  // =========================================================================
  // 2. Successful Processing History & Multiple Attempts
  // =========================================================================
  it('renders history table with sorted attempts, versions, duration, and status', () => {
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockCompletedJob, mockFailedRetryableJob]}
      />,
    );

    expect(screen.getByTestId('ingestion-history-section')).toBeInTheDocument();
    expect(screen.getByTestId('processing-history-table')).toBeInTheDocument();

    // Verify row for completed job
    expect(screen.getByTestId('ingestion-job-row-job_completed_001')).toBeInTheDocument();
    // Verify row for failed job
    expect(screen.getByTestId('ingestion-job-row-job_failed_002')).toBeInTheDocument();

    // Verify attempt numbers and versions rendered
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  // =========================================================================
  // 3. Failure Presentation & Administrative Diagnostics
  // =========================================================================
  it('displays safe administrative failure presentation with category, message, and retry button', () => {
    const onRetry = jest.fn();
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockFailedRetryableJob]}
        selectedJobId="job_failed_002"
        canManage={true}
        onRetry={onRetry}
      />,
    );

    // Administrative failure alert box
    expect(screen.getByTestId('failure-administrative-box')).toBeInTheDocument();
    expect(screen.getByTestId('failure-category-badge')).toHaveTextContent(
      'Almacenamiento de Archivos',
    );
    expect(screen.getByTestId('failure-explanation-message')).toHaveTextContent(
      'Conexión con el servicio de almacenamiento agotó el tiempo de espera.',
    );
    expect(screen.getByTestId('failure-retryability-indicator')).toHaveTextContent(
      'Fallo transitorio/recuperable',
    );
    expect(screen.getByTestId('failure-next-retry-info')).toBeInTheDocument();

    // Click retry button
    const retryBtn = screen.getByTestId('history-retry-button');
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('correctly presents non-retryable validation failures without retry button', () => {
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockValidationFailedNonRetryableJob]}
        canManage={true}
      />,
    );

    expect(screen.getByTestId('failure-category-badge')).toHaveTextContent(
      'Validación de Formato y Estructura',
    );
    expect(screen.getByTestId('failure-retryability-indicator')).toHaveTextContent(
      'Fallo no recuperable',
    );
    expect(screen.queryByTestId('history-retry-button')).not.toBeInTheDocument();
  });

  // =========================================================================
  // 4. Diagnostic Detail Levels & Permission Enforcement
  // =========================================================================
  it('allows authorized administrators (canManage=true) to view technical diagnostics', () => {
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockFailedRetryableJob]}
        canManage={true}
      />,
    );

    // Click toggle button to open technical diagnostics
    const toggleBtn = screen.getByTestId('toggle-technical-diagnostics-button');
    fireEvent.click(toggleBtn);

    // Technical details should be revealed
    expect(screen.getByTestId('technical-diagnostics-view')).toBeInTheDocument();
    expect(screen.getByTestId('tech-error-code')).toHaveTextContent('STORAGE_TIMEOUT');
    expect(screen.getByTestId('tech-job-id')).toHaveTextContent('job_failed_002');
    expect(screen.getByTestId('sensitive-info-protection-notice')).toBeInTheDocument();
  });

  it('restricts technical diagnostics when user lacks administrative permissions (canManage=false)', () => {
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockFailedRetryableJob]}
        canManage={false}
      />,
    );

    const toggleBtn = screen.getByTestId('toggle-technical-diagnostics-button');
    fireEvent.click(toggleBtn);

    // Shows restricted warning, does NOT expose technical error codes
    expect(screen.getByTestId('technical-diagnostics-restricted')).toBeInTheDocument();
    expect(screen.queryByTestId('tech-error-code')).not.toBeInTheDocument();
  });

  // =========================================================================
  // 5. Sensitive Information Protection (No Leaks)
  // =========================================================================
  it('guarantees sensitive information (stack traces, paths, credentials) is never rendered', () => {
    const jobWithSanitizedMessage: IngestionJobItem = {
      ...mockFailedRetryableJob,
      lastErrorMessage: 'Error connecting to [redacted_uri] via [redacted_credentials]',
    };

    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[jobWithSanitizedMessage]}
        canManage={true}
      />,
    );

    const content = document.body.textContent || '';
    expect(content).not.toContain('node_modules');
    expect(content).not.toContain('postgresql://');
    expect(content).not.toContain('password=');
    expect(content).not.toContain('sk-');
    expect(content).not.toContain('AIza');
  });

  // =========================================================================
  // 6. Job Selection Interaction
  // =========================================================================
  it('calls onSelectJob when a row in the history table is clicked', () => {
    const onSelectJob = jest.fn();
    render(
      <ProcessingHistoryDiagnostics
        documentId="doc_123"
        jobs={[mockCompletedJob, mockFailedRetryableJob]}
        onSelectJob={onSelectJob}
      />,
    );

    const row = screen.getByTestId('ingestion-job-row-job_completed_001');
    fireEvent.click(row);
    expect(onSelectJob).toHaveBeenCalledWith('job_completed_001');
  });
});
