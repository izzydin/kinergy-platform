import { RetrievedChunk } from '../models/retrieved-chunk.model';
import { SimilarityScore } from '../value-objects/similarity-score.vo';
import { InvalidRetrievalQueryException } from '../exceptions/retrieval.exceptions';
import { RetrievalErrorCode } from '../enums/retrieval-error-code.enum';

export interface ReciprocalRankFusionOptions {
  /**
   * Positive smoothing constant for RRF formula: 1 / (k + rank).
   * Default: 60 (standard Cormack et al. setting).
   */
  readonly rrfConstant?: number;

  /**
   * Maximum number of fused chunks to return.
   * Default: 5. Bounded by [1, 50].
   */
  readonly topK?: number;
}

interface MutableCandidateEntry {
  chunk: RetrievedChunk;
  rrfScore: number;
  semanticRank?: number;
  lexicalRank?: number;
  sources: ('semantic' | 'keyword')[];
}

/**
 * Technology-Independent Reciprocal Rank Fusion (RRF) Ranking Engine.
 *
 * Implements the standard reciprocal rank fusion formulation:
 *   RRF(d) = Σ_{i ∈ sources} 1 / (k_rrf + rank_i(d))
 *
 * Invariants:
 * - Technology-independent pure domain logic (zero PostgreSQL/Prisma dependencies).
 * - Deduplicates by stable chunk identity (`chunk.id`).
 * - Deterministic tie-breaking on `chunk.id ASC` when fused scores are equal.
 * - Preserves provenance, metadata, and original ranks for diagnostics.
 * - Scales fused scores into [0, 1] for SimilarityScore compatibility.
 * - Handles empty or disjoint candidate lists gracefully.
 */
export class ReciprocalRankFusion {
  public static readonly DEFAULT_RRF_CONSTANT = 60;
  public static readonly DEFAULT_TOP_K = 5;
  public static readonly MAX_TOP_K = 50;

  /**
   * Fuses candidate chunk lists from semantic and lexical retrieval arms.
   */
  public static fuse(
    semanticCandidates: readonly RetrievedChunk[],
    lexicalCandidates: readonly RetrievedChunk[],
    options?: ReciprocalRankFusionOptions,
  ): RetrievedChunk[] {
    const kRrf = options?.rrfConstant ?? ReciprocalRankFusion.DEFAULT_RRF_CONSTANT;
    if (typeof kRrf !== 'number' || !Number.isFinite(kRrf) || kRrf <= 0) {
      throw new InvalidRetrievalQueryException(
        `RRF constant must be a positive finite number, received: ${kRrf}`,
        RetrievalErrorCode.INVALID_RETRIEVAL_CONFIG,
      );
    }

    const requestedTopK = options?.topK ?? ReciprocalRankFusion.DEFAULT_TOP_K;
    if (
      !Number.isInteger(requestedTopK) ||
      requestedTopK < 1 ||
      requestedTopK > ReciprocalRankFusion.MAX_TOP_K
    ) {
      throw new InvalidRetrievalQueryException(
        `RRF topK must be an integer between 1 and ${ReciprocalRankFusion.MAX_TOP_K}, received: ${requestedTopK}`,
        RetrievalErrorCode.INVALID_TOP_K,
      );
    }

    const candidatesMap = new Map<string, MutableCandidateEntry>();

    // 1. Process Semantic Candidates
    const visitedSemantic = new Set<string>();
    for (let i = 0; i < semanticCandidates.length; i++) {
      const chunk = semanticCandidates[i]!;
      const chunkKey = chunk.chunkId.value;
      if (visitedSemantic.has(chunkKey)) {
        continue; // Deterministic deduplication within the same arm
      }
      visitedSemantic.add(chunkKey);

      const oneBasedRank = i + 1;
      const scoreContribution = 1.0 / (kRrf + oneBasedRank);

      candidatesMap.set(chunkKey, {
        chunk,
        rrfScore: scoreContribution,
        semanticRank: oneBasedRank,
        sources: ['semantic'],
      });
    }

    // 2. Process Lexical Candidates
    const visitedLexical = new Set<string>();
    for (let j = 0; j < lexicalCandidates.length; j++) {
      const chunk = lexicalCandidates[j]!;
      const chunkKey = chunk.chunkId.value;
      if (visitedLexical.has(chunkKey)) {
        continue; // Deterministic deduplication within the same arm
      }
      visitedLexical.add(chunkKey);

      const oneBasedRank = j + 1;
      const scoreContribution = 1.0 / (kRrf + oneBasedRank);

      const existing = candidatesMap.get(chunkKey);
      if (existing) {
        existing.rrfScore += scoreContribution;
        existing.lexicalRank = oneBasedRank;
        existing.sources.push('keyword');
      } else {
        candidatesMap.set(chunkKey, {
          chunk,
          rrfScore: scoreContribution,
          lexicalRank: oneBasedRank,
          sources: ['keyword'],
        });
      }
    }

    if (candidatesMap.size === 0) {
      return [];
    }

    // Theoretical maximum RRF score occurs when a chunk is rank 1 in both arms:
    // maxScore = (1 / (k + 1)) + (1 / (k + 1)) = 2 / (k + 1)
    const maxTheoreticalRrfScore = 2.0 / (kRrf + 1.0);

    // 3. Deterministic Sorting:
    // Primary: rrfScore DESC
    // Secondary tie-breaker: chunk.chunkId.value ASC (lexicographical)
    const sortedEntries = Array.from(candidatesMap.values()).sort((a, b) => {
      const scoreDiff = b.rrfScore - a.rrfScore;
      if (Math.abs(scoreDiff) > 1e-9) {
        return scoreDiff;
      }
      return a.chunk.chunkId.value.localeCompare(b.chunk.chunkId.value);
    });

    // 4. Truncate to requested topK
    const topEntries = sortedEntries.slice(0, requestedTopK);

    // 5. Construct hydrated RetrievedChunk entities
    return topEntries.map((entry) => {
      // Normalize to [0.0, 1.0] for domain SimilarityScore compatibility
      const normalizedScore = Math.max(0.0, Math.min(1.0, entry.rrfScore / maxTheoreticalRrfScore));
      const roundedScore = Math.round(normalizedScore * 1000000) / 1000000;
      const distance = Math.max(0.0, Math.min(1.0, 1.0 - roundedScore));

      const updatedMetadata: Record<string, unknown> = {
        ...(entry.chunk.metadata || {}),
        rrfScore: Math.round(entry.rrfScore * 1000000) / 1000000,
        semanticRank: entry.semanticRank,
        lexicalRank: entry.lexicalRank,
        retrievalSources: entry.sources,
        retrievalStrategy: entry.sources.length > 1 ? 'HYBRID' : entry.sources[0]?.toUpperCase(),
      };

      return RetrievedChunk.create({
        id: entry.chunk.chunkId.value,
        chunkId: entry.chunk.chunkId,
        documentId: entry.chunk.documentId,
        documentVersionId: entry.chunk.documentVersionId,
        indexGenerationId: entry.chunk.indexGenerationId,
        content: entry.chunk.content,
        tokenCount: entry.chunk.tokenCount,
        similarity: SimilarityScore.create(roundedScore),
        distance,
        provenance: entry.chunk.provenance,
        metadata: updatedMetadata,
      });
    });
  }
}
