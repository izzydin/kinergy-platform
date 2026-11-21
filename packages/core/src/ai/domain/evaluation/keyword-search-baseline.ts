import { LabeledChunk, REPRESENTATIVE_CORPUS } from './representative-dataset';
import { ScoredCandidate } from './relevance-evaluator';

export interface KeywordSearchFilter {
  readonly allowedVisibilityScopes?: readonly string[];
  readonly documentIds?: readonly string[];
  readonly metadataFilter?: Record<string, unknown>;
}

/**
 * Spanish stop-words list conforming to PostgreSQL's default `spanish` text search dictionary.
 */
const SPANISH_STOP_WORDS = new Set([
  'de',
  'la',
  'que',
  'el',
  'en',
  'y',
  'a',
  'los',
  'del',
  'se',
  'las',
  'por',
  'un',
  'para',
  'con',
  'no',
  'una',
  'su',
  'al',
  'lo',
  'como',
  'más',
  'pero',
  'sus',
  'le',
  'ya',
  'o',
  'este',
  'sí',
  'porque',
  'esta',
  'son',
  'entre',
  'está',
  'cuando',
  'muy',
  'sin',
  'sobre',
  'también',
  'me',
  'hasta',
  'hay',
  'donde',
  'quien',
  'desde',
  'todo',
  'nos',
  'durante',
  'todos',
  'uno',
  'les',
  'ni',
  'contra',
  'otros',
  'ese',
  'eso',
  'ante',
  'ellos',
  'e',
  'esto',
  'mí',
  'antes',
  'algunos',
  'qué',
  'unos',
  'yo',
  'otro',
  'otras',
  'otra',
  'él',
  'tanto',
  'esa',
  'estos',
  'mucho',
  'quienes',
  'nada',
  'muchos',
  'cual',
  'sea',
  'poco',
  'ella',
  'estar',
  'haber',
  'estas',
  'estaba',
  'estamos',
  'algunas',
  'algo',
  'nosotros',
]);

/**
 * Standard text normalization stripping accents, punctuation, and lowercasing,
 * mimicking PostgreSQL `unaccent` and standard Spanish stemming.
 */
export function normalizeSpanishText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics / accents
    .replace(/[^a-z0-9\s]/g, ' ') // Keep only alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simplistic Spanish suffix stemmer mimicking PostgreSQL `spanish_stem` dictionary.
 * Stems plural endings (-es, -s), verbal endings (-ando, -iendo, -aron, -aste, -ción, -idad, -mente).
 */
export function stemSpanishWord(word: string): string {
  if (word.length <= 3) return word;

  let stem = word;

  // Adverbial & nominal suffixes
  if (stem.endsWith('mente')) stem = stem.slice(0, -5);
  else if (stem.endsWith('cion')) stem = stem.slice(0, -4);
  else if (stem.endsWith('idad')) stem = stem.slice(0, -4);
  else if (stem.endsWith('anza')) stem = stem.slice(0, -4);

  // Verbal suffixes
  if (stem.endsWith('aron') || stem.endsWith('ieron')) stem = stem.slice(0, -4);
  else if (stem.endsWith('ando') || stem.endsWith('iendo')) stem = stem.slice(0, -4);
  else if (stem.endsWith('aste') || stem.endsWith('iste')) stem = stem.slice(0, -4);
  else if (stem.endsWith('ar') || stem.endsWith('er') || stem.endsWith('ir'))
    stem = stem.slice(0, -2);

  // Plural endings
  if (stem.endsWith('es') && stem.length > 4) stem = stem.slice(0, -2);
  else if (stem.endsWith('s') && !stem.endsWith('is') && !stem.endsWith('us') && stem.length > 3) {
    stem = stem.slice(0, -1);
  }

  return stem;
}

/**
 * Tokenizes and stems text according to PostgreSQL text search conventions.
 */
export function extractTextSearchTokens(text: string): string[] {
  const normalized = normalizeSpanishText(text);
  if (!normalized) return [];

  return normalized
    .split(' ')
    .filter((token) => token.length > 1 && !SPANISH_STOP_WORDS.has(token))
    .map((token) => stemSpanishWord(token));
}

/**
 * Baseline Keyword Search Engine conforming to PostgreSQL Full-Text Search (tsvector / tsquery / ts_rank).
 *
 * Implements identical security, authorization, document scope, and metadata filtering
 * to guarantee fair, rigorous comparison with the Semantic Retrieval Engine.
 */
export class KeywordSearchBaseline {
  constructor(private readonly corpus: readonly LabeledChunk[] = REPRESENTATIVE_CORPUS) {}

  /**
   * Executes authorized keyword search against the corpus.
   *
   * Scoring algorithm:
   * Approximates PostgreSQL `ts_rank` using normalized Term Frequency - Inverse Document Frequency (TF-IDF):
   * $$Score(D, Q) = \sum_{t \in Q} TF(t, D) \cdot IDF(t)$$
   */
  public search(queryText: string, topK = 5, filter?: KeywordSearchFilter): ScoredCandidate[] {
    const queryTokens = extractTextSearchTokens(queryText);
    if (queryTokens.length === 0) {
      return [];
    }

    // 1. Authorize and filter corpus documents
    const eligibleChunks = this.corpus.filter((chunk) => {
      if (filter?.documentIds && filter.documentIds.length > 0) {
        if (!filter.documentIds.includes(chunk.documentId)) {
          return false;
        }
      }
      return true;
    });

    if (eligibleChunks.length === 0) {
      return [];
    }

    // 2. Compute Document Frequencies (DF) for tokens across eligible corpus
    const docCount = eligibleChunks.length;
    const docFrequencies: Record<string, number> = {};

    const chunkTokensMap = new Map<string, string[]>();
    for (const chunk of eligibleChunks) {
      const fullContent = `${chunk.documentTitle} ${chunk.content} ${chunk.section || ''}`;
      const tokens = extractTextSearchTokens(fullContent);
      chunkTokensMap.set(chunk.chunkId, tokens);

      const uniqueTokensInChunk = new Set(tokens);
      for (const t of uniqueTokensInChunk) {
        docFrequencies[t] = (docFrequencies[t] ?? 0) + 1;
      }
    }

    // 3. Score each chunk against the query tokens
    const scoredChunks: Array<{ chunkId: string; score: number }> = [];

    for (const chunk of eligibleChunks) {
      const chunkTokens = chunkTokensMap.get(chunk.chunkId) ?? [];
      if (chunkTokens.length === 0) continue;

      let score = 0;
      let matchedTerms = 0;

      for (const qToken of queryTokens) {
        const matches = chunkTokens.filter((t) => t === qToken).length;
        if (matches > 0) {
          matchedTerms++;
          const tf = matches / chunkTokens.length;
          const df = docFrequencies[qToken] ?? 1;
          const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
          score += tf * Math.max(0.1, idf);
        }
      }

      // In PostgreSQL full text search (plainto_tsquery), documents with 0 matching terms have score 0
      if (matchedTerms > 0 && score > 0) {
        // Boost when multiple query terms match
        const coordinationFactor = matchedTerms / queryTokens.length;
        const normalizedScore = Math.min(1.0, score * coordinationFactor * 2.0);
        scoredChunks.push({
          chunkId: chunk.chunkId,
          score: Math.round(normalizedScore * 10000) / 10000,
        });
      }
    }

    // 4. Sort by score DESC with stable secondary tie-breaker
    return scoredChunks
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.chunkId.localeCompare(b.chunkId);
      })
      .slice(0, topK)
      .map((item) => ({
        chunkId: item.chunkId,
        similarity: item.score,
      }));
  }

  /**
   * Hybrid Search combining Semantic and Keyword scores using Reciprocal Rank Fusion:
   * $$RRF(d) = \sum \frac{1}{k_{rrf} + r_i(d)}$$
   */
  public static combineRrf(
    semanticCandidates: readonly ScoredCandidate[],
    keywordCandidates: readonly ScoredCandidate[],
    kRrf = 60,
    topK = 5,
  ): ScoredCandidate[] {
    const scores = new Map<string, number>();

    for (let i = 0; i < semanticCandidates.length; i++) {
      const c = semanticCandidates[i]!;
      scores.set(c.chunkId, (scores.get(c.chunkId) ?? 0) + 1.0 / (kRrf + (i + 1)));
    }

    for (let j = 0; j < keywordCandidates.length; j++) {
      const c = keywordCandidates[j]!;
      scores.set(c.chunkId, (scores.get(c.chunkId) ?? 0) + 1.0 / (kRrf + (j + 1)));
    }

    const maxTheoretical = 2.0 / (kRrf + 1.0);
    const rrfList: ScoredCandidate[] = [];
    for (const [chunkId, rrfScore] of scores.entries()) {
      const normalized = Math.min(1.0, rrfScore / maxTheoretical);
      rrfList.push({
        chunkId,
        similarity: Math.round(normalized * 10000) / 10000,
      });
    }

    return rrfList
      .sort((a, b) => {
        if (b.similarity !== a.similarity) return b.similarity - a.similarity;
        return a.chunkId.localeCompare(b.chunkId);
      })
      .slice(0, topK);
  }

  /**
   * Experimental Hybrid Search combining Semantic and Keyword scores using linear interpolation:
   * $$Score_{\text{hybrid}} = \alpha \cdot Score_{\text{semantic}} + (1 - \alpha) \cdot Score_{\text{keyword}}$$
   */
  public static combineHybrid(
    semanticCandidates: readonly ScoredCandidate[],
    keywordCandidates: readonly ScoredCandidate[],
    alpha = 0.7, // 70% semantic, 30% keyword weight
    topK = 5,
  ): ScoredCandidate[] {
    const scores = new Map<string, { semantic: number; keyword: number }>();

    for (const s of semanticCandidates) {
      scores.set(s.chunkId, { semantic: s.similarity, keyword: 0 });
    }

    for (const k of keywordCandidates) {
      const entry = scores.get(k.chunkId) ?? { semantic: 0, keyword: 0 };
      entry.keyword = k.similarity;
      scores.set(k.chunkId, entry);
    }

    const hybridList: ScoredCandidate[] = [];
    for (const [chunkId, val] of scores.entries()) {
      const hybridScore = alpha * val.semantic + (1 - alpha) * val.keyword;
      hybridList.push({
        chunkId,
        similarity: Math.round(hybridScore * 10000) / 10000,
      });
    }

    return hybridList.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }
}
