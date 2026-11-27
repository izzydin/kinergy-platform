import { PrismaClient } from '@prisma/client';
import {
  ISemanticRetrievalPort,
  RetrievalQuery,
  RetrievedChunk,
  RetrievalProvenance,
  SimilarityScore,
  VectorValues,
  EmbeddingDimensionMismatchException,
  RetrievalDatabaseException,
  EmbeddingValidationException,
  VectorIndexingErrorCode,
} from '../../../../index';

interface RawRetrievedChunkRow {
  id: string;
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  index_generation_id: string;
  similarity: number | string;
  distance: number | string;
  content: string;
  token_count: number;
  chunk_sequence: number;
  chunk_provenance: unknown;
  chunk_metadata: unknown;
  chunk_language?: string;
  document_title: string;
  visibility_scope: string;
  version_number: number;
  original_file_name: string;
  mime_type: string;
  storage_key?: string;
}

/**
 * PostgreSQL + pgvector implementation of ISemanticRetrievalPort using Prisma raw SQL.
 *
 * Enforces:
 * - Single relational JOIN across embeddings, chunks, versions, documents, and generations.
 * - Strict multi-tenant authorization in SQL before ranking and LIMIT.
 * - Soft-delete exclusion (kd.deleted_at IS NULL).
 * - Document-level visibility scope authorization.
 * - Parameterized cosine distance (<=>) ordering with deterministic tie-breaking.
 * - Zero exposure of database-specific types to the domain layer.
 */
export class PrismaSemanticRetrievalRepository implements ISemanticRetrievalPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Performs an authorized, tenant-isolated vector similarity search.
   */
  public async search(
    queryVector: readonly number[],
    query: RetrievalQuery,
  ): Promise<RetrievedChunk[]> {
    this.validateQueryVector(queryVector);

    const { sql, params } = this.buildRetrievalSql(queryVector, query, false);

    try {
      const rows = await this.prisma.$queryRawUnsafe<RawRetrievedChunkRow[]>(sql, ...params);
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((r) => this.toRetrievedChunk(r));
    } catch (error: unknown) {
      if (
        error instanceof EmbeddingDimensionMismatchException ||
        error instanceof EmbeddingValidationException
      ) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new RetrievalDatabaseException(
        `Failed to execute semantic retrieval query: ${msg}`,
        error,
      );
    }
  }

  /**
   * Returns the count of chunks meeting the authorized search criteria and minimum similarity.
   */
  public async countMatches(
    queryVector: readonly number[],
    query: RetrievalQuery,
  ): Promise<number> {
    this.validateQueryVector(queryVector);

    const { sql, params } = this.buildRetrievalSql(queryVector, query, true);

    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
        sql,
        ...params,
      );
      if (!rows || rows.length === 0 || !rows[0]) {
        return 0;
      }
      return Number(rows[0].count);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new RetrievalDatabaseException(
        `Failed to count semantic retrieval matches: ${msg}`,
        error,
      );
    }
  }

  // --- Private Query Construction & Validation ---

  private validateQueryVector(queryVector: readonly number[]): void {
    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) {
      throw new EmbeddingValidationException(
        'Query vector must be a non-empty array of numbers.',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    if (queryVector.length !== 1024) {
      throw new EmbeddingDimensionMismatchException(1024, queryVector.length);
    }

    // Validates that all floats are finite numbers (no NaN, no Infinity)
    VectorValues.create([...queryVector], 1024);
  }

  private buildRetrievalSql(
    queryVector: readonly number[],
    query: RetrievalQuery,
    isCountOnly: boolean,
  ): { sql: string; params: unknown[] } {
    const vectorLiteral = `[${queryVector.join(',')}]`;
    const criteria = query.criteria;
    const cleanTenantId = criteria?.tenantId?.trim();
    if (!cleanTenantId) {
      throw new EmbeddingValidationException(
        'tenantId is strictly required for semantic retrieval.',
        VectorIndexingErrorCode.EMPTY_PAYLOAD,
      );
    }

    const selectClause = isCountOnly
      ? `SELECT COUNT(*)::int AS "count"`
      : `SELECT 
          de."id" AS "id",
          de."chunk_id" AS "chunk_id",
          de."document_id" AS "document_id",
          de."document_version_id" AS "document_version_id",
          de."index_generation_id" AS "index_generation_id",
          1 - (de."embedding" <=> $1::vector) AS "similarity",
          (de."embedding" <=> $1::vector) AS "distance",
          kc."content" AS "content",
          kc."token_count" AS "token_count",
          kc."sequence" AS "chunk_sequence",
          kc."provenance" AS "chunk_provenance",
          kc."metadata" AS "chunk_metadata",
          kc."language" AS "chunk_language",
          kd."title" AS "document_title",
          kd."visibility_scope" AS "visibility_scope",
          dv."version_number" AS "version_number",
          dv."original_file_name" AS "original_file_name",
          dv."mime_type" AS "mime_type",
          dv."storage_key" AS "storage_key"`;

    let sql = `
      ${selectClause}
      FROM "document_embeddings" de
      JOIN "index_generations" ig ON ig."id" = de."index_generation_id"
      JOIN "knowledge_documents" kd ON kd."id" = de."document_id"
      JOIN "document_versions" dv ON dv."id" = de."document_version_id"
      JOIN "knowledge_chunks" kc ON kc."id" = de."chunk_id"
      WHERE ig."tenant_id" = $2
        AND kd."tenant_id" = $2
        AND kc."tenant_id" = $2
        AND kd."deleted_at" IS NULL
    `;

    const params: unknown[] = [vectorLiteral, cleanTenantId];

    // 1. Generation filter (explicit generationId or ACTIVE status by default)
    if (criteria.generationId) {
      params.push(criteria.generationId.trim());
      sql += ` AND ig."id" = $${params.length}`;
    } else {
      sql += ` AND ig."status" = 'ACTIVE'`;
    }

    // 2. Visibility scopes authorization filter (Fail-closed: empty array produces 1=0 to guarantee no leaks)
    if (criteria.allowedVisibilityScopes && criteria.allowedVisibilityScopes.length > 0) {
      const scopePlaceholders = criteria.allowedVisibilityScopes.map((scope) => {
        params.push(scope);
        return `$${params.length}`;
      });
      sql += ` AND kd."visibility_scope"::text IN (${scopePlaceholders.join(', ')})`;
    } else if (
      criteria.allowedVisibilityScopes !== undefined &&
      criteria.allowedVisibilityScopes.length === 0
    ) {
      // Empty visibility scopes explicitly provided means caller has no authorized scopes
      sql += ` AND 1 = 0`;
    }

    // 3. Document IDs filter
    if (criteria.documentIds && criteria.documentIds.length > 0) {
      const docPlaceholders = criteria.documentIds.map((docId) => {
        params.push(docId);
        return `$${params.length}`;
      });
      sql += ` AND kd."id" IN (${docPlaceholders.join(', ')})`;
    }

    // 4. MIME types filter
    if (criteria.mimeTypes && criteria.mimeTypes.length > 0) {
      const mimePlaceholders = criteria.mimeTypes.map((mime) => {
        params.push(mime);
        return `$${params.length}`;
      });
      sql += ` AND dv."mime_type" IN (${mimePlaceholders.join(', ')})`;
    }

    // 5. Date boundaries
    if (criteria.createdFrom) {
      params.push(criteria.createdFrom);
      sql += ` AND kd."created_at" >= $${params.length}`;
    }
    if (criteria.createdTo) {
      params.push(criteria.createdTo);
      sql += ` AND kd."created_at" <= $${params.length}`;
    }

    // 6. Metadata JSON containment filter
    if (criteria.metadataFilter && Object.keys(criteria.metadataFilter).length > 0) {
      params.push(JSON.stringify(criteria.metadataFilter));
      sql += ` AND kc."metadata" IS NOT NULL AND kc."metadata"::jsonb @> $${params.length}::jsonb`;
    }

    // 7. Relevance threshold (minSimilarity)
    if (query.minSimilarity && query.minSimilarity.value > 0.0) {
      params.push(query.minSimilarity.value);
      sql += ` AND (1 - (de."embedding" <=> $1::vector)) >= $${params.length}`;
    }

    if (!isCountOnly) {
      // 8. Order by cosine distance ascending with deterministic tie-breaker on primary key
      sql += ` ORDER BY (de."embedding" <=> $1::vector) ASC, de."id" ASC`;

      // 9. Bounded topK LIMIT
      const limit = Math.max(1, Math.min(50, query.topK));
      params.push(limit);
      sql += ` LIMIT $${params.length};`;
    } else {
      sql += `;`;
    }

    return { sql, params };
  }

  private toRetrievedChunk(row: RawRetrievedChunkRow): RetrievedChunk {
    let provObj: Record<string, unknown> = {};
    if (typeof row.chunk_provenance === 'string') {
      try {
        provObj = JSON.parse(row.chunk_provenance) as Record<string, unknown>;
      } catch {
        provObj = {};
      }
    } else if (typeof row.chunk_provenance === 'object' && row.chunk_provenance !== null) {
      provObj = row.chunk_provenance as Record<string, unknown>;
    }

    let metaObj: Record<string, unknown> | undefined;
    if (typeof row.chunk_metadata === 'string') {
      try {
        metaObj = JSON.parse(row.chunk_metadata) as Record<string, unknown>;
      } catch {
        metaObj = undefined;
      }
    } else if (typeof row.chunk_metadata === 'object' && row.chunk_metadata !== null) {
      metaObj = row.chunk_metadata as Record<string, unknown>;
    }

    const headingPath = Array.isArray(provObj['sectionHierarchy'])
      ? (provObj['sectionHierarchy'] as string[])
      : Array.isArray(provObj['headingPath'])
        ? (provObj['headingPath'] as string[])
        : undefined;

    const sourceLocator =
      typeof row.storage_key === 'string' && row.storage_key.trim().length > 0
        ? row.storage_key.trim()
        : typeof provObj['sourceLocator'] === 'string'
          ? (provObj['sourceLocator'] as string)
          : undefined;

    const provenance = RetrievalProvenance.create({
      documentTitle: row.document_title,
      documentVersionNumber: Number(row.version_number),
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      chunkSequence: Number(row.chunk_sequence),
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      sourceLocator,
      pageNumber: typeof provObj['pageNumber'] === 'number' ? provObj['pageNumber'] : undefined,
      startChar: typeof provObj['startOffset'] === 'number' ? provObj['startOffset'] : undefined,
      endChar: typeof provObj['endOffset'] === 'number' ? provObj['endOffset'] : undefined,
      headingPath,
      sectionHierarchy: headingPath,
      language:
        row.chunk_language ||
        (typeof provObj['language'] === 'string' ? (provObj['language'] as string) : 'es'),
    });

    const dist = Number(row.distance);
    const similarity = SimilarityScore.fromCosineDistance(dist);

    return RetrievedChunk.create({
      id: row.id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      indexGenerationId: row.index_generation_id,
      content: row.content,
      tokenCount: Number(row.token_count),
      similarity,
      distance: dist,
      provenance,
      metadata: metaObj,
    });
  }
}
