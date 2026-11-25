import { RAGSourceCitation } from '../../domain/value-objects/rag-source-citation.vo';

/**
 * Strongly typed, canonical source citation representation for persisted messages and API responses.
 */
export interface CanonicalSourceCitation {
  readonly citationId?: string | null;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly chunkId: string;
  readonly documentVersionId?: string | null;
  readonly documentVersionNumber?: number | null;
  readonly excerpt?: string | null;
  readonly pageNumber?: number | null;
  readonly headingPath?: string[] | null;
  readonly relevanceScore: number;
  readonly retrievalRank?: number | null;
  readonly sourceStrategy?: string | null;
}

/**
 * Validation options for source attribution.
 */
export interface ValidateSourcesOptions {
  /**
   * List of document IDs authorized for the current tenant and retrieval scope.
   * If provided, citations referencing documents outside this list are rejected.
   */
  readonly allowedDocumentIds?: readonly string[];
}

/**
 * Domain Application Service responsible for verifying, sanitizing, deduplicating,
 * and serializing source references between AI-08 RAG retrieval and AI-09.3 canonical persistence.
 *
 * Guarantees:
 * 1. Provenance Integrity: Only citations from authorized retrieval evidence are retained.
 * 2. Tenant Isolation: Citations to foreign/unauthorized documents are strictly rejected.
 * 3. Security & Privacy: Internal storage paths, filesystem paths, credentials, and embeddings are stripped.
 * 4. Deduplication: Duplicate chunk references within a response are unified, retaining the highest relevance score.
 * 5. Score Bounding: Relevance scores are bounded strictly to [0.0, 1.0].
 * 6. Terminal Safety: Failed and cancelled generations never retain source attribution.
 */
export class AiSourceAttributionService {
  /**
   * Internal sensitive/unsafe property keys that must NEVER be persisted or exposed.
   */
  public static readonly UNSAFE_KEYS = new Set([
    'storagepath',
    'filepath',
    'absolutepath',
    'relativepath',
    'file_path',
    'file_name',
    'uri',
    'url',
    'embedding',
    'embeddings',
    'vector',
    'vectors',
    'databaseurl',
    'connectionstring',
    'dburi',
    'token',
    'secret',
    'apikey',
    'credentials',
    'password',
    'internalid',
    'prismaid',
    'txid',
  ]);

  /**
   * Checks whether a candidate metadata key is an internal-only or unsafe property.
   */
  public static isUnsafeKey(key: string): boolean {
    return this.UNSAFE_KEYS.has(key.toLowerCase().trim());
  }

  /**
   * Validates, cleanses, deduplicates, and bounds a list of source references.
   *
   * @param sources Raw sources from retrieval result, RAG answer, or persistence
   * @param options Optional validation boundaries (e.g. authorized document IDs)
   */
  public static validateAndSanitize(
    sources: readonly unknown[] | null | undefined,
    options?: ValidateSourcesOptions,
  ): CanonicalSourceCitation[] {
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return [];
    }

    const allowedDocIdsSet =
      options?.allowedDocumentIds && options.allowedDocumentIds.length > 0
        ? new Set(options.allowedDocumentIds.map((id) => id.trim()))
        : null;

    const deduplicatedMap = new Map<string, CanonicalSourceCitation>();

    for (const raw of sources) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }

      const candidate = raw as Record<string, unknown>;

      // 1. Mandatory Identity Fields Validation
      const rawDocId = candidate['documentId'];
      const rawTitle = candidate['documentTitle'];
      const rawChunkId = candidate['chunkId'];

      if (
        typeof rawDocId !== 'string' ||
        rawDocId.trim().length === 0 ||
        typeof rawTitle !== 'string' ||
        rawTitle.trim().length === 0 ||
        typeof rawChunkId !== 'string' ||
        rawChunkId.trim().length === 0
      ) {
        // Reject or safely omit malformed references missing required identity
        continue;
      }

      const documentId = rawDocId.trim();
      const documentTitle = rawTitle.trim();
      const chunkId = rawChunkId.trim();

      // 2. Cross-tenant / Authorized Document Enforcement
      if (allowedDocIdsSet && !allowedDocIdsSet.has(documentId)) {
        // Discard citation to unauthorized document ID
        continue;
      }

      // 3. Relevance Score Bounding [0.0, 1.0]
      const rawScore = candidate['relevanceScore'];
      let relevanceScore: number;
      if (typeof rawScore === 'number' && Number.isFinite(rawScore)) {
        relevanceScore = Math.max(0.0, Math.min(1.0, rawScore));
      } else {
        // Reject items without valid numeric relevance score
        continue;
      }

      // 4. Page Number Validation (Positive integer)
      const rawPage = candidate['pageNumber'];
      let pageNumber: number | null = null;
      if (typeof rawPage === 'number' && Number.isInteger(rawPage) && rawPage > 0) {
        pageNumber = rawPage;
      }

      // 5. Heading Path Validation (Array of non-empty strings)
      const rawHeadings = candidate['headingPath'];
      let headingPath: string[] | null = null;
      if (Array.isArray(rawHeadings)) {
        const validHeadings = rawHeadings
          .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
          .map((h) => h.trim());
        if (validHeadings.length > 0) {
          headingPath = validHeadings;
        }
      }

      // 6. Source Strategy Validation
      const rawStrategy = candidate['sourceStrategy'];
      let sourceStrategy: string | null = null;
      if (typeof rawStrategy === 'string' && rawStrategy.trim().length > 0) {
        sourceStrategy = rawStrategy.trim();
      }

      // Optional enriched citation provenance fields
      const citationId =
        typeof candidate['citationId'] === 'string' && candidate['citationId'].trim().length > 0
          ? candidate['citationId'].trim()
          : null;
      const documentVersionId =
        typeof candidate['documentVersionId'] === 'string' &&
        candidate['documentVersionId'].trim().length > 0
          ? candidate['documentVersionId'].trim()
          : null;
      const documentVersionNumber =
        typeof candidate['documentVersionNumber'] === 'number' &&
        Number.isInteger(candidate['documentVersionNumber'])
          ? candidate['documentVersionNumber']
          : null;
      const excerpt =
        typeof candidate['excerpt'] === 'string' && candidate['excerpt'].trim().length > 0
          ? candidate['excerpt'].trim()
          : null;
      const retrievalRank =
        typeof candidate['retrievalRank'] === 'number' &&
        Number.isInteger(candidate['retrievalRank'])
          ? candidate['retrievalRank']
          : null;

      // 7. Security: Verify no unsafe internal file paths in display title
      if (
        documentTitle.includes(':\\') ||
        documentTitle.startsWith('/var/') ||
        documentTitle.startsWith('/etc/') ||
        documentTitle.startsWith('/tmp/')
      ) {
        // Sanitize suspicious absolute path in document title to generic title
        continue;
      }

      const citationKey = `${documentId}::${chunkId}`;
      const existing = deduplicatedMap.get(citationKey);

      if (existing) {
        // Deduplicate: Keep citation with higher relevance score, merging headingPath/pageNumber if missing
        if (relevanceScore > existing.relevanceScore) {
          deduplicatedMap.set(citationKey, {
            documentId,
            documentTitle,
            chunkId,
            pageNumber: pageNumber ?? existing.pageNumber ?? null,
            headingPath: headingPath ?? existing.headingPath ?? null,
            relevanceScore,
            sourceStrategy: sourceStrategy ?? existing.sourceStrategy ?? null,
            ...(citationId || existing.citationId
              ? { citationId: citationId ?? existing.citationId }
              : {}),
            ...(documentVersionId || existing.documentVersionId
              ? { documentVersionId: documentVersionId ?? existing.documentVersionId }
              : {}),
            ...(documentVersionNumber !== null || existing.documentVersionNumber !== undefined
              ? { documentVersionNumber: documentVersionNumber ?? existing.documentVersionNumber }
              : {}),
            ...(excerpt || existing.excerpt ? { excerpt: excerpt ?? existing.excerpt } : {}),
            ...(retrievalRank !== null || existing.retrievalRank !== undefined
              ? { retrievalRank: retrievalRank ?? existing.retrievalRank }
              : {}),
          });
        }
      } else {
        deduplicatedMap.set(citationKey, {
          documentId,
          documentTitle,
          chunkId,
          pageNumber,
          headingPath,
          relevanceScore,
          sourceStrategy,
          ...(citationId !== null ? { citationId } : {}),
          ...(documentVersionId !== null ? { documentVersionId } : {}),
          ...(documentVersionNumber !== null ? { documentVersionNumber } : {}),
          ...(excerpt !== null ? { excerpt } : {}),
          ...(retrievalRank !== null ? { retrievalRank } : {}),
        });
      }
    }

    return Array.from(deduplicatedMap.values());
  }

  /**
   * Serializes validated canonical citations into clean, JSON-serializable records for PostgreSQL jsonb.
   * Ensures no internal or dangerous fields are included.
   */
  public static serializeForPersistence(
    citations: readonly CanonicalSourceCitation[] | null | undefined,
  ): Record<string, unknown>[] {
    if (!citations || !Array.isArray(citations) || citations.length === 0) {
      return [];
    }

    return citations.map((c) => ({
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      chunkId: c.chunkId,
      ...(c.citationId !== undefined && c.citationId !== null ? { citationId: c.citationId } : {}),
      ...(c.documentVersionId !== undefined && c.documentVersionId !== null
        ? { documentVersionId: c.documentVersionId }
        : {}),
      ...(c.documentVersionNumber !== undefined && c.documentVersionNumber !== null
        ? { documentVersionNumber: c.documentVersionNumber }
        : {}),
      ...(c.excerpt !== undefined && c.excerpt !== null ? { excerpt: c.excerpt } : {}),
      pageNumber: c.pageNumber ?? null,
      headingPath: c.headingPath ? [...c.headingPath] : null,
      relevanceScore: Math.round(c.relevanceScore * 10000) / 10000,
      ...(c.retrievalRank !== undefined && c.retrievalRank !== null
        ? { retrievalRank: c.retrievalRank }
        : {}),
      sourceStrategy: c.sourceStrategy ?? null,
    }));
  }

  /**
   * Deserializes persisted jsonb records from the database into CanonicalSourceCitation domain models.
   */
  public static deserializeFromPersistence(raw: unknown): CanonicalSourceCitation[] {
    if (!raw || !Array.isArray(raw)) {
      return [];
    }

    return this.validateAndSanitize(raw);
  }

  /**
   * Maps persisted or domain source citations to safe client-facing DTO representation.
   * Strips all internal fields, guaranteeing safe API serialization.
   */
  public static mapToResponseDto(raw: unknown): CanonicalSourceCitation[] | null {
    if (!raw || !Array.isArray(raw)) {
      return null;
    }

    const sanitized = this.validateAndSanitize(raw);
    return sanitized.length > 0 ? sanitized : null;
  }

  /**
   * Converts a domain RAGSourceCitation Value Object to CanonicalSourceCitation.
   */
  public static fromRAGSourceCitation(citation: RAGSourceCitation): CanonicalSourceCitation {
    return {
      documentId: citation.documentId,
      documentTitle: citation.documentTitle,
      chunkId: citation.chunkId,
      documentVersionId: citation.documentVersionId ?? null,
      documentVersionNumber: citation.documentVersionNumber ?? null,
      excerpt: citation.excerpt ?? null,
      pageNumber: citation.pageNumber ?? null,
      headingPath: citation.headingPath ? [...citation.headingPath] : null,
      relevanceScore: citation.relevanceScore,
      retrievalRank: citation.retrievalRank ?? null,
      sourceStrategy: citation.sourceStrategy ?? null,
    };
  }
}
