import type {
  Conversation,
  ChatMessage,
  RAGSourceCitationDto,
  RAGMetadataDto,
  RAGAnswerResponseDto,
  MessageRole,
  MessageStatus,
} from '../../modules/intelligence/assistant/types/assistant.types';
import type {
  KnowledgeDocumentItem,
  DocumentVersionItem,
  IngestionStageInfo,
  IngestionRetrievalStatus,
  VisibilityScope,
  IngestionStatus,
  IngestionStageStatus,
} from '../../modules/intelligence/knowledge/types/knowledge-contract.types';

/**
 * AI-09.10-IT.02 — Standardized, Deterministic Intelligence Test Factories
 *
 * Provides immutable, type-safe builder functions for all Kynergy Intelligence domain entities.
 * Eliminates ad-hoc, divergent mock objects and guarantees test reproducibility across
 * unit, component, contract, and integration test suites.
 */

let idCounter = 0;

/**
 * Generates an incrementing, deterministic identifier with an optional prefix.
 */
export function generateTestId(prefix = 'test'): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString().padStart(4, '0')}`;
}

/**
 * Resets the factory internal ID counter to ensure deterministic sequencing across test runs.
 */
export function resetFactoryCounters(): void {
  idCounter = 0;
}

/**
 * Factory for creating a deterministic RAG Source Citation DTO.
 */
export function createMockCitation(
  overrides: Partial<RAGSourceCitationDto> = {},
): RAGSourceCitationDto {
  const docId = overrides.documentId ?? generateTestId('doc');
  const chunkId = overrides.chunkId ?? generateTestId('chk');

  return {
    citationId: overrides.citationId ?? generateTestId('cit'),
    documentId: docId,
    documentTitle: overrides.documentTitle ?? 'Protocolo Clínico de Kinesiología 2026',
    chunkId,
    excerpt:
      overrides.excerpt ??
      'El tratamiento en fase subaguda contempla movilización pasiva continua y crioterapia intermitente.',
    pageNumber: overrides.pageNumber ?? 14,
    headingPath: overrides.headingPath ?? ['Rehabilitación', 'Fase Subaguda', 'Pautas Clínicas'],
    relevanceScore: overrides.relevanceScore ?? 0.94,
    retrievalRank: overrides.retrievalRank ?? 1,
    sourceStrategy: overrides.sourceStrategy ?? 'HYBRID',
    documentVersionId: overrides.documentVersionId ?? generateTestId('ver'),
    documentVersionNumber: overrides.documentVersionNumber ?? 1,
    originalFileName: overrides.originalFileName ?? 'protocolo-clinico-2026.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    fileSizeBytes: overrides.fileSizeBytes ?? 2048576,
    documentStatus: overrides.documentStatus ?? 'READY',
    previewStatus: overrides.previewStatus ?? 'DOCUMENT_AVAILABLE',
    canPreview: overrides.canPreview ?? true,
    previewUnavailableReason: overrides.previewUnavailableReason ?? null,
  };
}

/**
 * Factory for creating generation execution metadata.
 */
export function createMockGenerationMetadata(
  overrides: Partial<RAGMetadataDto> = {},
): RAGMetadataDto {
  return {
    model: overrides.model ?? 'qwen3:4b',
    retrievalCount: overrides.retrievalCount ?? 3,
    latencyMs: overrides.latencyMs ?? 420,
    finishReason: overrides.finishReason ?? 'stop',
  };
}

/**
 * Factory for creating a domain ChatMessage entity.
 */
export function createMockMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  const role: MessageRole = overrides.role ?? 'assistant';
  const status: MessageStatus = overrides.status ?? 'success';

  return {
    id: overrides.id ?? generateTestId('msg'),
    turnId: overrides.turnId ?? generateTestId('turn'),
    role,
    content:
      overrides.content ??
      (role === 'user'
        ? '¿Cuáles son los parámetros de carga en tendinopatía rotuliana?'
        : 'Para tendinopatía rotuliana se recomiendan contracciones isométricas a 60° seguidas de carga excéntrica.'),
    createdAt: overrides.createdAt ?? '2026-11-26T14:00:00.000Z',
    status,
    grounded: overrides.grounded ?? role === 'assistant',
    sources: overrides.sources ?? (role === 'assistant' ? [createMockCitation()] : undefined),
    metadata:
      overrides.metadata ?? (role === 'assistant' ? createMockGenerationMetadata() : undefined),
    sequenceNumber: overrides.sequenceNumber ?? 1,
    errorCode: overrides.errorCode,
    error: overrides.error,
    retryable: overrides.retryable,
    retryAfterSeconds: overrides.retryAfterSeconds,
    correlationId: overrides.correlationId ?? generateTestId('corr'),
  };
}

/**
 * Factory for creating a Conversation entity.
 */
export function createMockConversation(overrides: Partial<Conversation> = {}): Conversation {
  const convId = overrides.id ?? generateTestId('conv');

  return {
    id: convId,
    title: overrides.title ?? 'Consulta de Rehabilitación Rotuliana',
    createdAt: overrides.createdAt ?? '2026-11-26T13:45:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-11-26T14:05:00.000Z',
    messages: overrides.messages ?? [
      createMockMessage({ role: 'user', content: 'Consulta inicial de pautas rotulianas' }),
      createMockMessage({ role: 'assistant', sequenceNumber: 2 }),
    ],
    tenantId: overrides.tenantId ?? 'tenant_test_default',
    userId: overrides.userId ?? 'usr_test_default',
  };
}

/**
 * Factory for creating a complete RAGAnswerResponseDto.
 */
export function createMockRAGAnswerResponse(
  overrides: Partial<RAGAnswerResponseDto> = {},
): RAGAnswerResponseDto {
  return {
    answer:
      overrides.answer ??
      'Protocolo clínico verificado: aplicar carga progresiva con intervalos de 48 horas entre sesiones.',
    grounded: overrides.grounded ?? true,
    sources: overrides.sources ?? [createMockCitation()],
    metadata: overrides.metadata ?? createMockGenerationMetadata(),
  };
}

/**
 * Factory for creating a DocumentVersionItem.
 */
export function createMockDocumentVersion(
  overrides: Partial<DocumentVersionItem> = {},
): DocumentVersionItem {
  return {
    id: overrides.id ?? generateTestId('ver'),
    versionNumber: overrides.versionNumber ?? 1,
    originalFileName: overrides.originalFileName ?? 'manual-kinesiologia-2026.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    fileExtension: overrides.fileExtension ?? 'pdf',
    fileSize: overrides.fileSize ?? 1048576,
    checksum:
      overrides.checksum ?? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    language: overrides.language ?? 'es',
    uploadedBy: overrides.uploadedBy ?? 'usr_qa_specialist',
    storageReference: overrides.storageReference ?? 'tenants/tenant_qa/documents/doc_0001/v1.pdf',
    ingestionStatus: overrides.ingestionStatus ?? 'READY',
    createdAt: overrides.createdAt ?? '2026-11-26T10:00:00.000Z',
  };
}

/**
 * Factory for creating a KnowledgeDocumentItem.
 */
export function createMockKnowledgeDocument(
  overrides: Partial<KnowledgeDocumentItem> = {},
): KnowledgeDocumentItem {
  const docId = overrides.id ?? generateTestId('doc');
  const scope: VisibilityScope = overrides.visibilityScope ?? 'ALL_STAFF';
  const status: IngestionStatus = overrides.ingestionStatus ?? 'READY';
  const currentVersionId = overrides.currentVersionId ?? generateTestId('ver');

  return {
    id: docId,
    title: overrides.title ?? 'Manual de Procedimientos en Kinesiología Deportiva',
    description:
      overrides.description ??
      'Guía oficial con pautas clínicas actualizadas para profesionales del centro Kynergy.',
    visibilityScope: scope,
    currentVersionId,
    uploadedBy: overrides.uploadedBy ?? 'usr_qa_specialist',
    createdAt: overrides.createdAt ?? '2026-11-26T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-11-26T10:15:00.000Z',
    originalFileName: overrides.originalFileName ?? 'manual-procedimientos-2026.pdf',
    mimeType: overrides.mimeType ?? 'application/pdf',
    fileExtension: overrides.fileExtension ?? 'pdf',
    fileSize: overrides.fileSize ?? 2450000,
    checksum:
      overrides.checksum ?? 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    versionNumber: overrides.versionNumber ?? 1,
    versionCount: overrides.versionCount ?? 1,
    storageReference: overrides.storageReference ?? `tenants/tenant_qa/documents/${docId}/v1.pdf`,
    ingestionStatus: status,
    versions: overrides.versions ?? [
      createMockDocumentVersion({
        id: currentVersionId,
        versionNumber: 1,
        originalFileName: overrides.originalFileName ?? 'manual-procedimientos-2026.pdf',
      }),
    ],
  };
}

/**
 * Factory for creating an IngestionStageInfo item.
 */
export function createMockIngestionStage(
  overrides: Partial<IngestionStageInfo> = {},
): IngestionStageInfo {
  const status: IngestionStageStatus = overrides.status ?? 'COMPLETED';

  return {
    stage: overrides.stage ?? 'INDEXING',
    label: overrides.label ?? 'Generación y Registro de Embeddings',
    status,
    order: overrides.order ?? 3,
    startedAt: overrides.startedAt ?? '2026-11-26T10:00:05.000Z',
    completedAt: overrides.completedAt ?? '2026-11-26T10:00:25.000Z',
    durationMs: overrides.durationMs ?? 20000,
    metrics: overrides.metrics ?? {
      totalChunks: 48,
      embeddedChunks: 48,
      indexedChunks: 48,
      extractedTokens: 14200,
    },
    failureInfo: overrides.failureInfo ?? null,
  };
}

/**
 * Factory for creating an IngestionRetrievalStatus item.
 */
export function createMockRetrievalStatus(
  overrides: Partial<IngestionRetrievalStatus> = {},
): IngestionRetrievalStatus {
  return {
    documentId: overrides.documentId ?? generateTestId('doc'),
    isReadyForRetrieval: overrides.isReadyForRetrieval ?? true,
    overallReady: overrides.overallReady ?? true,
    hasActiveIndexGeneration: overrides.hasActiveIndexGeneration ?? true,
    isDocumentActive: overrides.isDocumentActive ?? true,
    chunksPersisted: overrides.chunksPersisted ?? true,
    embeddingsCommitted: overrides.embeddingsCommitted ?? true,
    activeGenerationId: overrides.activeGenerationId ?? generateTestId('gen'),
    targetVersionId: overrides.targetVersionId ?? generateTestId('ver'),
    targetVersionNumber: overrides.targetVersionNumber ?? 1,
    currentVersionId: overrides.currentVersionId ?? generateTestId('ver'),
    currentVersionNumber: overrides.currentVersionNumber ?? 1,
    totalChunks: overrides.totalChunks ?? 48,
    indexedChunks: overrides.indexedChunks ?? 48,
    embeddingsCount: overrides.embeddingsCount ?? 48,
    evaluatedAt: overrides.evaluatedAt ?? '2026-11-26T10:00:30.000Z',
  };
}
