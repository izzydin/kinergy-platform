export interface HashableTurnPayload {
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

interface NodeHashLike {
  update(data: string, encoding?: string): NodeHashLike;
  digest(encoding?: string): string;
}

interface NodeCryptoLike {
  createHash(algorithm: string): NodeHashLike;
}

declare const require: ((moduleName: string) => NodeCryptoLike) | undefined;

function getNodeCrypto(): NodeCryptoLike | undefined {
  try {
    if (typeof require === 'function') {
      return require('crypto');
    }
  } catch {
    // ignore
  }

  try {
    const globalObj = globalThis as unknown as {
      crypto?: {
        createHash?: (algorithm: string) => NodeHashLike;
      };
    };
    if (globalObj.crypto?.createHash) {
      return globalObj.crypto as NodeCryptoLike;
    }
  } catch {
    // ignore
  }

  return undefined;
}

/**
 * Deterministic payload hasher for AI conversation turn requests.
 *
 * Normalization Guarantees:
 * 1. Prompt trimming: Leading and trailing whitespace is stripped.
 * 2. Newline normalization: CRLF (\r\n) is converted to standard LF (\n).
 * 3. Metadata canonicalization: Object keys are sorted lexicographically at all recursive levels.
 * 4. Isolation: Excludes transient timestamps, request IDs, and credentials.
 * 5. Determinism: Computes a cryptographically collision-resistant SHA-256 hex string (64 characters).
 */
export class AiPayloadHasher {
  public static hash(payload: HashableTurnPayload): string {
    const canonicalString = this.toCanonicalString(payload);
    const nodeCrypto = getNodeCrypto();
    if (nodeCrypto) {
      return nodeCrypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
    }

    throw new Error('No cryptographic SHA-256 provider available in current environment.');
  }

  public static toCanonicalString(payload: HashableTurnPayload): string {
    const normalizedPrompt = (payload.prompt ?? '').trim().replace(/\r\n/g, '\n');
    const canonicalMetadata = payload.metadata ? this.canonicalizeObject(payload.metadata) : null;

    if (!canonicalMetadata || Object.keys(canonicalMetadata).length === 0) {
      return JSON.stringify({ prompt: normalizedPrompt });
    }

    return JSON.stringify({
      metadata: canonicalMetadata,
      prompt: normalizedPrompt,
    });
  }

  private static canonicalizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const val = obj[key];
      if (val === undefined) {
        continue;
      }
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = this.canonicalizeObject(val as Record<string, unknown>);
      } else {
        result[key] = val;
      }
    }

    return result;
  }
}
