# AI-05: Embedding Profile & Model Identity Resolution

## 1. Overview & Immutable Identity Concept

An `EmbeddingProfile` is an immutable Value Object and persisted database entity that captures the exact geometric and algorithmic configuration used to generate vector representations in the Kynergy Platform.

### Core Architecture Principle

Environment variables (e.g. `EMBEDDING_MODEL=bge-m3`) and floating Docker tags (e.g. `bge-m3:latest`) are **mutable**. Relying on them as historical identifiers leads to silent semantic index contamination when upstream model weights change.

In Kynergy:
$$\text{Profile ID} = f(\text{provider}, \text{model}, \text{version}, \text{digest}, \text{dims}, \text{tokenizer}, \text{norm}, \text{pooling}, \text{type})$$

Any modification to model weights (altering the SHA-256 digest), dimensionality, pooling strategy, or normalization policy produces an entirely **new profile**, leaving existing historical profiles untouched.

---

## 2. Active Baseline Profile Specification

Empirically extracted and verified from the live Ollama environment:

| Attribute                 | Baseline Value                                                            | Invariant Rule                                          |
| :------------------------ | :------------------------------------------------------------------------ | :------------------------------------------------------ |
| **`profileId`**           | `prof_bge-m3_1024_790764642607`                                           | Deterministic cryptographic fingerprint.                |
| **`provider`**            | `ollama`                                                                  | Fixed inference engine abstraction.                     |
| **`modelName`**           | `bge-m3`                                                                  | Base model family.                                      |
| **`modelVersion`**        | `latest`                                                                  | Tag or semver release.                                  |
| **`modelDigest`**         | `sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab` | Exact immutable weights hash from Ollama `/api/tags`.   |
| **`dimensions`**          | `1024`                                                                    | Exact output vector dimensionality.                     |
| **`tokenizerIdentity`**   | `xlm-roberta`                                                             | Byte-level BPE vocabulary.                              |
| **`normalizationPolicy`** | `UNIT_L2`                                                                 | Vectors are unit-normalized ($\|\mathbf{v}\|_2 = 1.0$). |
| **`poolingStrategy`**     | `CLS`                                                                     | First token pooling.                                    |
| **`embeddingType`**       | `DENSE`                                                                   | Standard dense vector embeddings.                       |

---

## 3. Dynamic Profile Resolution Protocol

The `OllamaEmbeddingAdapter` implements `resolveProfile()`:

```typescript
const profile: EmbeddingProfile = await embeddingAdapter.resolveProfile();
```

### Execution Flow:

1. Adapter queries `GET /api/tags` on the active Ollama host.
2. Locates the model entry matching `config.embeddingModel`.
3. Extracts the immutable SHA-256 `digest` (e.g., `790764...`) and details (`embedding_length: 1024`).
4. Generates an `EmbeddingProfile` Value Object.
5. In persistence (`PrismaIndexGenerationRepository`), the profile is upserted into the `embedding_profiles` table before creating or updating any `IndexGeneration`.

---

## 4. Model Drift & Upgrade Lifecycle

```mermaid
sequenceDiagram
    participant O as Ollama Runtime
    participant A as OllamaEmbeddingAdapter
    participant R as IndexGenerationRepository
    participant DB as PostgreSQL (embedding_profiles)

    Note over O,DB: 1. Model Digest Verification at Startup / Job Init
    A->>O: GET /api/tags
    O-->>A: { digest: "sha256:790764...", details: { embedding_length: 1024 } }
    A->>A: resolveProfile() -> Profile A
    A->>R: ensureProfilePersisted(Profile A)
    R->>DB: UPSERT embedding_profiles (profile_id = Profile A)

    Note over O,DB: 2. Model Weight Drift / Upstream Update
    O-->>O: ollama pull bge-m3 (New weights: "sha256:8899aa...")
    A->>O: GET /api/tags
    O-->>A: { digest: "sha256:8899aa..." }
    A->>A: resolveProfile() -> Profile B (Distinct profileId)
    A->>R: ensureProfilePersisted(Profile B)
    R->>DB: INSERT embedding_profiles (profile_id = Profile B)

    Note over O,DB: Profile A embeddings remain isolated; new IndexGeneration binds to Profile B.
```

### Safety Guarantees:

- **No In-Place Mutation**: Changing weights cannot modify historical profiles or existing embeddings.
- **Index Isolation**: Active index generations remain strictly bound to their assigned profile until an atomic promotion occurs.
- **Search Compatibility**: Search queries verify `queryProfile.isCompatibleWith(activeIndexProfile)` before calculating cosine similarities.
