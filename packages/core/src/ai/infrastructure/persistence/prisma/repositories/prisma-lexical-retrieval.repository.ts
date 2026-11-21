import { PrismaClient } from '@prisma/client';
import {
  ILexicalRetrievalPort,
  RetrievalQuery,
  RetrievedChunk,
  RetrievalProvenance,
  SimilarityScore,
  RetrievalDatabaseException,
  EmptyRetrievalQueryException,
} from '../../../../index';

interface RawLexicalRetrievedChunkRow {
  id: string;
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  index_generation_id: string;
  rank: number | string;
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
 * PostgreSQL Full-Text Search implementation of ILexicalRetrievalPort using Prisma raw SQL.
 *
 * Enforces:
 * - Parameterized PostgreSQL text search (`websearch_to_tsquery` and `to_tsvector`).
 * - Weighted lexical ranking: Title ('A'), Section ('B'), Content ('C').
 * - Dynamic multi-lingual text search dictionary selection ('spanish' vs 'english' based on chunk language).
 * - Single relational JOIN across chunks, versions, and documents.
 * - Strict multi-tenant isolation in SQL prior to ranking and LIMIT (`kc.tenant_id = $2 AND kd.tenant_id = $2`).
 * - Soft-delete exclusion (`kd.deleted_at IS NULL`).
 * - Document-level visibility scope and ID authorization.
 * - Deterministic tie-breaking on `kc.id ASC`.
 * - GIN index acceleration over stored generated `kc.tsv` column.
 * - Zero exposure of database-specific types to the domain layer.
 */
export class PrismaLexicalRetrievalRepository implements ILexicalRetrievalPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Executes an authorized, tenant-isolated full-text search.
   */
  public async search(query: RetrievalQuery): Promise<RetrievedChunk[]> {
    this.validateQuery(query);

    const { sql, params } = this.buildRetrievalSql(query, false);

    try {
      const rows = await this.prisma.$queryRawUnsafe<RawLexicalRetrievedChunkRow[]>(sql, ...params);
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((r) => this.toRetrievedChunk(r));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new RetrievalDatabaseException(
        `Failed to execute lexical full-text retrieval query: ${msg}`,
        error,
      );
    }
  }

  /**
   * Returns the count of chunks matching the authorized search criteria and full-text query.
   */
  public async countMatches(query: RetrievalQuery): Promise<number> {
    this.validateQuery(query);

    const { sql, params } = this.buildRetrievalSql(query, true);

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
        `Failed to count lexical retrieval matches: ${msg}`,
        error,
      );
    }
  }

  // --- Private SQL Construction & Row Mapping ---

  private validateQuery(query: RetrievalQuery): void {
    if (!query || !query.normalizedQuery || query.normalizedQuery.trim().length === 0) {
      throw new EmptyRetrievalQueryException(
        'Lexical retrieval query must contain non-whitespace text.',
      );
    }
  }

  private buildRetrievalSql(
    query: RetrievalQuery,
    isCountOnly: boolean,
  ): { sql: string; params: unknown[] } {
    const criteria = query.criteria;
    const cleanTenantId = criteria.tenantId.trim();
    const cleanQuery = query.normalizedQuery.trim();

    const selectClause = isCountOnly
      ? `SELECT COUNT(*)::int AS "count"`
      : `SELECT 
          kc."id" AS "id",
          kc."id" AS "chunk_id",
          kc."document_id" AS "document_id",
          kc."document_version_id" AS "document_version_id",
          'lexical' AS "index_generation_id",
          ts_rank(
            setweight(to_tsvector(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, coalesce(kd."title", '')), 'A') || kc."tsv",
            websearch_to_tsquery(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, $1)
          ) AS "rank",
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
      FROM "knowledge_chunks" kc
      JOIN "knowledge_documents" kd ON kd."id" = kc."document_id"
      JOIN "document_versions" dv ON dv."id" = kc."document_version_id"
      WHERE kc."tenant_id" = $2
        AND kd."tenant_id" = $2
        AND kd."deleted_at" IS NULL
        AND (
          kc."tsv" @@ websearch_to_tsquery(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, $1)
          OR to_tsvector(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, kd."title") @@ websearch_to_tsquery(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, $1)
        )
    `;

    const params: unknown[] = [cleanQuery, cleanTenantId];

    // 1. Visibility scopes authorization filter
    if (criteria.allowedVisibilityScopes && criteria.allowedVisibilityScopes.length > 0) {
      const scopePlaceholders = criteria.allowedVisibilityScopes.map((scope) => {
        params.push(scope);
        return `$${params.length}`;
      });
      sql += ` AND kd."visibility_scope"::text IN (${scopePlaceholders.join(', ')})`;
    }

    // 2. Document IDs filter
    if (criteria.documentIds && criteria.documentIds.length > 0) {
      const docPlaceholders = criteria.documentIds.map((docId) => {
        params.push(docId);
        return `$${params.length}`;
      });
      sql += ` AND kd."id" IN (${docPlaceholders.join(', ')})`;
    }

    // 3. MIME types filter
    if (criteria.mimeTypes && criteria.mimeTypes.length > 0) {
      const mimePlaceholders = criteria.mimeTypes.map((mime) => {
        params.push(mime);
        return `$${params.length}`;
      });
      sql += ` AND dv."mime_type" IN (${mimePlaceholders.join(', ')})`;
    }

    // 4. Date boundaries
    if (criteria.createdFrom) {
      params.push(criteria.createdFrom);
      sql += ` AND kd."created_at" >= $${params.length}`;
    }
    if (criteria.createdTo) {
      params.push(criteria.createdTo);
      sql += ` AND kd."created_at" <= $${params.length}`;
    }

    // 5. Metadata JSON containment filter
    if (criteria.metadataFilter && Object.keys(criteria.metadataFilter).length > 0) {
      params.push(JSON.stringify(criteria.metadataFilter));
      sql += ` AND kc."metadata" IS NOT NULL AND kc."metadata"::jsonb @> $${params.length}::jsonb`;
    }

    // 6. Minimum score threshold (if specified and > 0)
    if (query.minSimilarity && query.minSimilarity.value > 0.0) {
      params.push(query.minSimilarity.value);
      sql += ` AND ts_rank(
        setweight(to_tsvector(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, coalesce(kd."title", '')), 'A') || kc."tsv",
        websearch_to_tsquery(CASE WHEN kc."language" = 'en' THEN 'english'::regconfig ELSE 'spanish'::regconfig END, $1)
      ) >= $${params.length}`;
    }

    if (!isCountOnly) {
      // 7. Order by lexical rank descending with deterministic tie-breaking on chunk ID
      sql += ` ORDER BY "rank" DESC, kc."id" ASC`;

      // 8. Bounded topK LIMIT
      const limit = Math.max(1, Math.min(50, query.topK));
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }

    return { sql, params };
  }

  private toRetrievedChunk(row: RawLexicalRetrievedChunkRow): RetrievedChunk {
    let provData: Record<string, unknown> = {};
    if (typeof row.chunk_provenance === 'string') {
      try {
        provData = JSON.parse(row.chunk_provenance);
      } catch {
        provData = {};
      }
    } else if (typeof row.chunk_provenance === 'object' && row.chunk_provenance !== null) {
      provData = row.chunk_provenance as Record<string, unknown>;
    }

    let metaData: Record<string, unknown> | undefined;
    if (typeof row.chunk_metadata === 'string') {
      try {
        metaData = JSON.parse(row.chunk_metadata);
      } catch {
        metaData = undefined;
      }
    } else if (typeof row.chunk_metadata === 'object' && row.chunk_metadata !== null) {
      metaData = row.chunk_metadata as Record<string, unknown>;
    }

    const sectionHierarchy: string[] = [];
    if (
      metaData &&
      typeof metaData['section'] === 'string' &&
      metaData['section'].trim().length > 0
    ) {
      sectionHierarchy.push(metaData['section'].trim());
    }

    const provenance = RetrievalProvenance.create({
      documentTitle: row.document_title,
      documentVersionNumber: Number(row.version_number) || 1,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      chunkSequence: Number(row.chunk_sequence) || 0,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      sourceLocator:
        row.storage_key ||
        (typeof provData['sourceLocator'] === 'string' ? provData['sourceLocator'] : undefined),
      pageNumber: typeof provData['pageNumber'] === 'number' ? provData['pageNumber'] : undefined,
      startChar: typeof provData['startOffset'] === 'number' ? provData['startOffset'] : undefined,
      endChar: typeof provData['endOffset'] === 'number' ? provData['endOffset'] : undefined,
      sectionHierarchy: sectionHierarchy.length > 0 ? sectionHierarchy : undefined,
      language: row.chunk_language || 'es',
    });

    const rawRank = Number(row.rank) || 0.0;
    // Normalize lexical rank safely to [0, 1] range for SimilarityScore compatibility
    const normalizedScore = Math.max(0.0, Math.min(1.0, rawRank));
    const distance = Math.max(0.0, Math.min(1.0, 1.0 - normalizedScore));

    return RetrievedChunk.create({
      id: row.id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      indexGenerationId: row.index_generation_id || 'lexical',
      content: row.content,
      tokenCount: Number(row.token_count) || 0,
      similarity: SimilarityScore.create(normalizedScore),
      distance,
      provenance,
      metadata: metaData,
    });
  }
}
