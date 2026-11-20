import { PrismaClient } from '@prisma/client';
import {
  IVectorStorePort,
  VectorSearchOptions,
  VectorSearchResult,
} from '../../../../ports/outbound/vector-store.port';
import { DocumentEmbedding } from '../../../../domain/models/document-embedding.entity';
import { EmbeddingValidationException } from '../../../../domain/exceptions/vector-indexing.exceptions';
import { VectorIndexingErrorCode } from '../../../../domain/enums/vector-indexing-error-code.enum';

interface RawEmbeddingRow {
  id: string;
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  index_generation_id: string;
  profile_id: string;
  dimensions: number;
  content_fingerprint: string;
  created_at: Date;
  vector_text?: string;
}

interface RawSimilarityRow {
  id: string;
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  index_generation_id: string;
  similarity: number;
  distance: number;
}

/**
 * PostgreSQL + pgvector implementation of IVectorStorePort using Prisma raw SQL.
 * Keeps pgvector serialization and SQL syntax strictly inside this infrastructure adapter.
 */
export class PrismaVectorStoreRepository implements IVectorStorePort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persists a single validated document embedding.
   */
  public async save(embedding: DocumentEmbedding): Promise<void> {
    await this.saveBatch([embedding]);
  }

  /**
   * Persists a bounded batch of document embeddings within an atomic transaction.
   */
  public async saveBatch(embeddings: DocumentEmbedding[]): Promise<void> {
    if (embeddings.length === 0) return;

    const expectedDim = 1024;
    for (const emb of embeddings) {
      if (emb.dimensions !== expectedDim || emb.vector.dimensions !== expectedDim) {
        throw new EmbeddingValidationException(
          `PostgreSQL pgvector persistence requires strictly ${expectedDim} dimensions, received ${emb.dimensions}`,
          VectorIndexingErrorCode.DIMENSION_MISMATCH,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const emb of embeddings) {
        const vectorLiteral = `[${emb.vector.values.join(',')}]`;

        await tx.$executeRawUnsafe(
          `INSERT INTO "document_embeddings" (
            "id", "chunk_id", "document_id", "document_version_id",
            "index_generation_id", "profile_id", "dimensions",
            "embedding", "content_fingerprint", "created_at"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
          ON CONFLICT ("chunk_id", "index_generation_id") DO UPDATE SET
            "embedding" = EXCLUDED."embedding",
            "content_fingerprint" = EXCLUDED."content_fingerprint",
            "dimensions" = EXCLUDED."dimensions",
            "profile_id" = EXCLUDED."profile_id";`,
          emb.id.value,
          emb.chunkId.value,
          emb.documentId,
          emb.documentVersionId,
          emb.indexGenerationId.value,
          emb.embeddingProfileId,
          emb.dimensions,
          vectorLiteral,
          emb.contentFingerprint,
          emb.createdAt,
        );
      }
    });
  }

  /**
   * Finds an embedding by chunk identifier and optional index generation.
   */
  public async findByChunkId(
    chunkId: string,
    generationId?: string,
  ): Promise<DocumentEmbedding | null> {
    const cleanChunkId = chunkId.trim();
    let query = `
      SELECT 
        "id", "chunk_id", "document_id", "document_version_id",
        "index_generation_id", "profile_id", "dimensions",
        "content_fingerprint", "created_at",
        "embedding"::text AS "vector_text"
      FROM "document_embeddings"
      WHERE "chunk_id" = $1
    `;
    const params: unknown[] = [cleanChunkId];

    if (generationId) {
      query += ` AND "index_generation_id" = $2`;
      params.push(generationId.trim());
    }

    query += ` LIMIT 1;`;

    const rows = await this.prisma.$queryRawUnsafe<RawEmbeddingRow[]>(query, ...params);
    if (!rows || rows.length === 0 || !rows[0]) {
      return null;
    }

    const row = rows[0];
    const rawFloats = row.vector_text
      ? (JSON.parse(row.vector_text) as number[])
      : new Array(row.dimensions).fill(0);

    return DocumentEmbedding.reconstitute({
      id: row.id,
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      indexGenerationId: row.index_generation_id,
      embeddingProfileId: row.profile_id,
      dimensions: row.dimensions,
      vector: rawFloats,
      contentFingerprint: row.content_fingerprint,
      createdAt: new Date(row.created_at),
    });
  }

  /**
   * Finds all embeddings associated with a specific document version and optional generation.
   */
  public async findByDocumentVersionId(
    documentVersionId: string,
    generationId?: string,
  ): Promise<DocumentEmbedding[]> {
    const cleanVerId = documentVersionId.trim();
    let query = `
      SELECT 
        "id", "chunk_id", "document_id", "document_version_id",
        "index_generation_id", "profile_id", "dimensions",
        "content_fingerprint", "created_at",
        "embedding"::text AS "vector_text"
      FROM "document_embeddings"
      WHERE "document_version_id" = $1
    `;
    const params: unknown[] = [cleanVerId];

    if (generationId) {
      query += ` AND "index_generation_id" = $2`;
      params.push(generationId.trim());
    }

    const rows = await this.prisma.$queryRawUnsafe<RawEmbeddingRow[]>(query, ...params);
    if (!rows || rows.length === 0) return [];

    return rows.map((row) => {
      const rawFloats = row.vector_text
        ? (JSON.parse(row.vector_text) as number[])
        : new Array(row.dimensions).fill(0);

      return DocumentEmbedding.reconstitute({
        id: row.id,
        chunkId: row.chunk_id,
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        indexGenerationId: row.index_generation_id,
        embeddingProfileId: row.profile_id,
        dimensions: row.dimensions,
        vector: rawFloats,
        contentFingerprint: row.content_fingerprint,
        createdAt: new Date(row.created_at),
      });
    });
  }

  /**
   * Performs approximate nearest neighbor (ANN) cosine distance vector search using HNSW index.
   */
  public async similaritySearch(
    queryVector: number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchResult[]> {
    if (queryVector.length !== 1024) {
      throw new EmbeddingValidationException(
        `Search query vector dimension must be 1024, received ${queryVector.length}`,
        VectorIndexingErrorCode.DIMENSION_MISMATCH,
      );
    }

    const vectorLiteral = `[${queryVector.join(',')}]`;
    const minSim = options.minSimilarity ?? 0.0;
    const limit = Math.max(1, Math.min(options.limit, 100));

    let query = `
      SELECT 
        "id",
        "chunk_id",
        "document_id",
        "document_version_id",
        "index_generation_id",
        1 - ("embedding" <=> $1::vector) AS "similarity",
        ("embedding" <=> $1::vector) AS "distance"
      FROM "document_embeddings"
      WHERE "index_generation_id" = $2
    `;
    const params: unknown[] = [vectorLiteral, options.generationId.trim()];

    if (options.documentIds && options.documentIds.length > 0) {
      const docIdsPlaceholder = options.documentIds
        .map((_, i) => `$${params.length + 1 + i}`)
        .join(',');
      query += ` AND "document_id" IN (${docIdsPlaceholder})`;
      params.push(...options.documentIds);
    }

    if (minSim > 0.0) {
      query += ` AND (1 - ("embedding" <=> $1::vector)) >= $${params.length + 1}`;
      params.push(minSim);
    }

    query += ` ORDER BY "embedding" <=> $1::vector ASC LIMIT $${params.length + 1};`;
    params.push(limit);

    const rows = await this.prisma.$queryRawUnsafe<RawSimilarityRow[]>(query, ...params);
    return rows.map((r) => ({
      embeddingId: r.id,
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentVersionId: r.document_version_id,
      generationId: r.index_generation_id,
      similarity: Number(r.similarity),
      distance: Number(r.distance),
    }));
  }

  public async deleteByDocumentId(documentId: string): Promise<number> {
    const res = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "document_embeddings" WHERE "document_id" = $1;`,
      documentId.trim(),
    );
    return res;
  }

  public async deleteByDocumentVersionId(versionId: string): Promise<number> {
    const res = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "document_embeddings" WHERE "document_version_id" = $1;`,
      versionId.trim(),
    );
    return res;
  }

  public async deleteByGenerationId(generationId: string): Promise<number> {
    const res = await this.prisma.$executeRawUnsafe(
      `DELETE FROM "document_embeddings" WHERE "index_generation_id" = $1;`,
      generationId.trim(),
    );
    return res;
  }

  public async countByGenerationId(generationId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ count: string | number }>>(
      `SELECT COUNT(*)::int AS "count" FROM "document_embeddings" WHERE "index_generation_id" = $1;`,
      generationId.trim(),
    );
    if (!rows || rows.length === 0 || !rows[0]) return 0;
    return Number(rows[0].count);
  }
}
