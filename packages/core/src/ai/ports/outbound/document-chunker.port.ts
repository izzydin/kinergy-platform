import { NormalizedDocument } from '../../domain/models/normalized-document.model';
import { DocumentChunk } from '../../domain/models/document-chunk.entity';
import { ChunkingConfig } from '../../domain/value-objects/chunking-config.vo';

export const DOCUMENT_CHUNKER_PORT = Symbol('DOCUMENT_CHUNKER_PORT');

/**
 * Outbound port contract for deterministic, structure-aware document chunking.
 * Transforms an immutable NormalizedDocument into an ordered sequence of DocumentChunk entities.
 */
export interface IDocumentChunkerPort {
  /**
   * Splits a normalized document into deterministic, structure-preserving chunks
   * satisfying token target/min/max boundaries, overlap rules, and provenance lineage.
   *
   * @param document The fully normalized and validated document aggregate.
   * @param config Optional chunking configuration overrides.
   * @returns Ordered array of immutable DocumentChunk entities.
   */
  chunk(document: NormalizedDocument, config?: ChunkingConfig): DocumentChunk[];
}
