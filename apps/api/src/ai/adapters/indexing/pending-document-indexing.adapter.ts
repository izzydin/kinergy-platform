import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentIndexingPort,
  DocumentIndexingRequest,
  DocumentIndexingResult,
} from '@kinergy-platform/core';

/**
 * Default indexing adapter fulfilling the Hexagonal IDocumentIndexingPort.
 * In Milestone AI-03, full READY-state completion remains pending downstream vector store
 * and embedding integration (AI-04). This adapter exercises the complete lifecycle handshake
 * and reports the downstream boundary cleanly.
 */
@Injectable()
export class PendingDocumentIndexingAdapter implements IDocumentIndexingPort {
  private readonly logger = new Logger(PendingDocumentIndexingAdapter.name);

  public async indexDocument(request: DocumentIndexingRequest): Promise<DocumentIndexingResult> {
    this.logger.log(
      `Executing indexing boundary contract for document '${request.documentId}' v${request.versionNumber} in tenant '${request.tenantId}'. Downstream vector storage pending AI-04.`,
    );

    return {
      indexed: true,
      chunkCount: 1,
      embeddingModel: 'pending-ai-04',
      notes: 'Handshake successful. Downstream vector embedding pending AI-04 integration.',
    };
  }
}
