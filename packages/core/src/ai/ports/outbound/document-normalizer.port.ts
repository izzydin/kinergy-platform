import { ExtractedDocument } from '../../domain/models/extracted-document.model';
import { NormalizedDocument } from '../../domain/models/normalized-document.model';
import { NormalizationConfig } from '../../domain/value-objects/normalization-config.vo';

/**
 * Outbound Port defining the contract for document content normalization.
 * Transforms an ExtractedDocument into a clean, normalized, provenance-preserving NormalizedDocument.
 */
export interface IDocumentNormalizerPort {
  /**
   * Normalizes all structural blocks in an ExtractedDocument while strictly preserving
   * document structure, section hierarchy, source block traceability, numbers, and business semantics.
   */
  normalize(
    document: ExtractedDocument,
    config?: Partial<NormalizationConfig>,
  ): Promise<NormalizedDocument>;
}
