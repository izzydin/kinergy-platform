# Milestone AI-04.4 — Chunking Configuration & Operational Guide

## Overview

Document chunking in Kinergy Platform is parameterized via the `ChunkingConfig` value object in `@kinergy-platform/core` and wired into the NestJS configuration system through `AiConfiguration` in `apps/api`.

This architecture ensures that chunk size, boundary constraints, and overlap windows can be tuned per deployment environment (development, staging, clinical production) without altering domain entities or algorithm implementations.

---

## 1. ChunkingConfig Value Object Specification

### 1.1 Invariants and Constraints

```typescript
export interface ChunkingConfigProps {
  readonly targetChunkTokens?: number;
  readonly minimumChunkTokens?: number;
  readonly maximumChunkTokens?: number;
  readonly overlapTokens?: number;
  readonly strategy?: string;
  readonly version?: string;
}
```

| Parameter            | Type     | Default             | Hard Invariant / Validation Rule                                                      |
| :------------------- | :------- | :------------------ | :------------------------------------------------------------------------------------ |
| `targetChunkTokens`  | `number` | `450`               | Positive integer. Must satisfy: `minimumChunkTokens <= target <= maximumChunkTokens`. |
| `minimumChunkTokens` | `number` | `400`               | Positive integer $> 0$. Must satisfy: `minimum <= maximumChunkTokens`.                |
| `maximumChunkTokens` | `number` | `500`               | Positive integer $> 0$. Hard ceiling for emitted chunks.                              |
| `overlapTokens`      | `number` | `60`                | Non-negative integer $\ge 0$. Must satisfy: `overlapTokens < minimumChunkTokens`.     |
| `strategy`           | `string` | `'structure-aware'` | Non-empty string identifier.                                                          |
| `version`            | `string` | `'1.0.0'`           | Non-empty semantic version string for lineage tracking.                               |

### 1.2 Rejected Invalid Configurations

The `ChunkingConfig.create()` factory method strictly enforces validation and throws `DocumentValidationException` under any of the following conditions:

1. `minimumChunkTokens <= 0` or non-integer.
2. `maximumChunkTokens <= 0` or non-integer.
3. `targetChunkTokens < minimumChunkTokens` or `targetChunkTokens > maximumChunkTokens`.
4. `overlapTokens < 0`.
5. `overlapTokens >= minimumChunkTokens` (prevents redundant, infinite chunking loops).
6. Empty or whitespace-only `strategy` or `version`.

---

## 2. NestJS Environment Configuration & Integration

### 2.1 Environment Variable Schema

The following environment variables map into `AiConfiguration` and configure default chunking behaviors:

| Environment Variable      | Config Property      | Default             | Purpose                                                         |
| :------------------------ | :------------------- | :------------------ | :-------------------------------------------------------------- |
| `AI_TARGET_CHUNK_TOKENS`  | `targetChunkTokens`  | `450`               | Primary chunk size target for section grouping.                 |
| `AI_MINIMUM_CHUNK_TOKENS` | `minimumChunkTokens` | `400`               | Minimum token size threshold before chunk flushing.             |
| `AI_MAXIMUM_CHUNK_TOKENS` | `maximumChunkTokens` | `500`               | Strict token boundary ceiling for paragraph/sentence splitting. |
| `AI_OVERLAP_TOKENS`       | `overlapTokens`      | `60`                | Context window overlap between contiguous intra-section chunks. |
| `AI_CHUNKING_STRATEGY`    | `chunkingStrategy`   | `'structure-aware'` | Default chunking strategy identifier.                           |

### 2.2 NestJS Dependency Injection Architecture

The chunking subsystem is bound in `AiModule` via standard inversion-of-control tokens:

```typescript
// Token Definitions (apps/api/src/ai/ai.tokens.ts)
export const TOKENIZER_TOKEN = Symbol('TOKENIZER_TOKEN');
export const DOCUMENT_CHUNKER_TOKEN = Symbol('DOCUMENT_CHUNKER_TOKEN');

// Module Registration (apps/api/src/ai/ai.module.ts)
const tokenizerProvider = {
  provide: TOKENIZER_TOKEN,
  useClass: DeterministicBpeTokenizerAdapter,
};

const documentChunkerProvider = {
  provide: DOCUMENT_CHUNKER_TOKEN,
  useClass: StructureAwareChunkerService,
};
```

---

## 3. Operational Guidelines & Tuning Considerations

### 3.1 Retrieval Precision vs. Context Window

- **Target = 450, Max = 500:** Optimized for the planned `bge-m3:latest` embedding model (8,192 token context window). Chunks of ~450 tokens capture approximately 2–3 full paragraphs of clinical guidance or an entire policy block, providing dense, semantically focused embeddings without context dilution.
- **Overlap = 60 Tokens (~40–45 words):** Ensures that sentences spanning paragraph boundaries retain enough narrative context for embedding similarity search without generating excessive duplicate chunks.

### 3.2 Handling Highly Granular Policies (Small Sections)

- Standard RAG pipelines often artificially pad or combine unrelated sections when they fall below `minimumChunkTokens`.
- In Kinergy Platform, **small standalone sections (e.g. 50-token cancellation rules) are preserved as independent chunks**.
- Retaining small chunks ensures precise, high-confidence matching during compliance, price, and scheduling queries.
