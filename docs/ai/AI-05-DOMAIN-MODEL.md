# AI-05: Embedding & Vector Indexing Domain Model

## 1. Domain Entities & Value Objects

### 1.1 `EmbeddingProfile` (Value Object)

An immutable, deterministic cryptographic fingerprint representing the vector representation configuration.

| Field                 | Type                  | Description                                            |
| :-------------------- | :-------------------- | :----------------------------------------------------- |
| `profileId`           | `string`              | Deterministic fingerprint: `prof_<model>_<dim>_<hash>` |
| `provider`            | `string`              | Embedding provider name (e.g., `ollama`)               |
| `modelName`           | `string`              | Model identifier (e.g., `bge-m3`)                      |
| `modelVersion`        | `string`              | Immutable version tag (e.g., `latest` or semver)       |
| `modelDigest`         | `string`              | Cryptographic digest of weights (SHA-256)              |
| `dimensions`          | `number`              | Strictly positive integer (1,024 for BGE-M3)           |
| `tokenizerIdentity`   | `string`              | Associated tokenizer (e.g., `xlm-roberta`)             |
| `normalizationPolicy` | `NormalizationPolicy` | `UNIT_L2` or `NONE`                                    |
| `poolingStrategy`     | `PoolingStrategy`     | `CLS`, `MEAN`, or `LAST_TOKEN`                         |
| `embeddingType`       | `EmbeddingType`       | `DENSE`, `SPARSE`, or `HYBRID`                         |
| `createdAt`           | `Date`                | Timestamp of profile registration                      |

#### Invariants:

- Changing any material parameter (model name, digest, dimensions, normalization, pooling) yields a new, distinct `profileId`.
- Mathematical search compatibility (`isCompatibleWith`) requires identical dimensions, model name, model digest, and normalization policy.

---

### 1.2 `VectorValues` (Value Object)

Encapsulates the raw numerical array of floating-point vector coordinates.

#### Invariants:

- Non-empty array of IEEE 754 numbers.
- Zero tolerance for `NaN`, `+Infinity`, or `-Infinity`.
- Strictly matches expected dimensions if specified.
- Implements Euclidean $L_2$ norm: $\|\mathbf{v}\|_2 = \sqrt{\sum_{i=1}^d v_i^2}$.
- Validates unit normalization within tolerance ($\epsilon = 0.001$).
- Deeply immutable (`Object.freeze`).

---

### 1.3 `DocumentEmbedding` (Entity)

Represents a dense vector embedding generated for a specific `DocumentChunk` within an `IndexGeneration`.

| Field                | Type                | Description                                       |
| :------------------- | :------------------ | :------------------------------------------------ |
| `id`                 | `EmbeddingId`       | Unique identifier (`emb_...`)                     |
| `chunkId`            | `ChunkId`           | Reference to parent `DocumentChunk`               |
| `documentId`         | `string`            | Root document identifier                          |
| `documentVersionId`  | `string`            | Immutable document version identifier             |
| `indexGenerationId`  | `IndexGenerationId` | Owning index generation aggregate                 |
| `embeddingProfileId` | `string`            | Foreign key to `EmbeddingProfile.profileId`       |
| `dimensions`         | `number`            | Dimension count (must equal `profile.dimensions`) |
| `vector`             | `VectorValues`      | Validated high-dimensional coordinate values      |
| `contentFingerprint` | `string`            | SHA-256 checksum of chunk text at embed time      |
| `createdAt`          | `Date`              | Timestamp of creation                             |

---

### 1.4 `IndexGeneration` (Aggregate Root)

Manages the lifecycle, health, and atomic promotion of a versioned vector search index for a tenant.

| Field               | Type                    | Description                                        |
| :------------------ | :---------------------- | :------------------------------------------------- |
| `id`                | `IndexGenerationId`     | Unique generation aggregate ID (`idxgen_...`)      |
| `tenantId`          | `string`                | Multi-tenant tenant boundary                       |
| `generationNumber`  | `number`                | Monotonically increasing sequence number ($\ge 1$) |
| `profile`           | `EmbeddingProfile`      | Immutable profile binding for this generation      |
| `status`            | `IndexGenerationStatus` | Current lifecycle status                           |
| `targetChunkCount`  | `number`                | Expected chunk count to be indexed                 |
| `indexedChunkCount` | `number`                | Current count of successfully embedded chunks      |
| `failedChunkCount`  | `number`                | Current count of failed chunks                     |
| `version`           | `number`                | Optimistic locking aggregate version               |
| `createdAt`         | `Date`                  | Generation creation timestamp                      |
| `startedAt`         | `Date \| null`          | Timestamp when indexing started                    |
| `validatedAt`       | `Date \| null`          | Timestamp when validation commenced                |
| `activatedAt`       | `Date \| null`          | Timestamp when generation was promoted to active   |
| `retiredAt`         | `Date \| null`          | Timestamp when generation was superseded           |
| `failedAt`          | `Date \| null`          | Timestamp of unrecoverable failure                 |
| `cancelledAt`       | `Date \| null`          | Timestamp of cancellation                          |

---

### 1.5 `VectorIndexingJob` (Model)

Coordinates batch processing, retries, and bounded execution across document, version, and generation scopes.

- **Scopes**: `DOCUMENT`, `DOCUMENT_VERSION`, `INDEX_GENERATION`, `REINDEX_ALL`.
- **States**: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- **Durable Progress**: Tracks `processedChunks`, `failedChunks`, `currentBatchNumber`, `attemptCount`, and `maxAttempts`.
