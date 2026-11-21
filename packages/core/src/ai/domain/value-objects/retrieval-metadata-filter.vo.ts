import { InvalidMetadataFilterException } from '../exceptions/retrieval.exceptions';

/**
 * Authoritative allowlist of metadata fields eligible for semantic retrieval filtering.
 * Prevents arbitrary JSON traversal, schema confusion, and unauthorized attribute probing.
 */
export const ALLOWED_RETRIEVAL_METADATA_KEYS = Object.freeze([
  'department',
  'subspecialty',
  'category',
  'topic',
  'language',
  'strategy',
  'documentType',
  'difficulty',
  'author',
  'tags',
] as const);

export type AllowedMetadataKey = (typeof ALLOWED_RETRIEVAL_METADATA_KEYS)[number];

const DANGEROUS_SQL_PATTERNS = [
  /--/,
  /;\s*$/,
  /\/\*/,
  /\*\//,
  /xp_/i,
  /\b(union|select|insert|update|delete|drop|alter|exec|execute)\b/i,
];

/**
 * Value Object encapsulating a validated, allowlisted metadata filter
 * applied to chunk queries before similarity ordering and limit.
 */
export class RetrievalMetadataFilter {
  public static readonly MAX_KEYS = 10;
  public static readonly MAX_STRING_LENGTH = 100;
  public static readonly MAX_ARRAY_LENGTH = 20;

  private readonly _filter: Readonly<Record<string, unknown>>;

  private constructor(filter: Record<string, unknown>) {
    this._filter = Object.freeze({ ...filter });
    Object.freeze(this);
  }

  public static empty(): RetrievalMetadataFilter {
    return new RetrievalMetadataFilter({});
  }

  public static create(rawFilter?: Record<string, unknown> | null): RetrievalMetadataFilter {
    if (!rawFilter || typeof rawFilter !== 'object' || Array.isArray(rawFilter)) {
      return RetrievalMetadataFilter.empty();
    }

    const entries = Object.entries(rawFilter);
    if (entries.length === 0) {
      return RetrievalMetadataFilter.empty();
    }

    if (entries.length > RetrievalMetadataFilter.MAX_KEYS) {
      throw new InvalidMetadataFilterException(
        `Filter specifies ${entries.length} keys, exceeding maximum of ${RetrievalMetadataFilter.MAX_KEYS}.`,
      );
    }

    const validated: Record<string, unknown> = {};

    for (const [key, value] of entries) {
      // 1. Allowlist verification
      if (!ALLOWED_RETRIEVAL_METADATA_KEYS.includes(key as AllowedMetadataKey)) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' is not in the authoritative allowlist (${ALLOWED_RETRIEVAL_METADATA_KEYS.join(', ')}).`,
        );
      }

      // 2. Value validation
      validated[key] = RetrievalMetadataFilter.validateValue(key, value);
    }

    return new RetrievalMetadataFilter(validated);
  }

  private static validateValue(key: string, value: unknown): unknown {
    if (value === null || value === undefined) {
      throw new InvalidMetadataFilterException(
        `Metadata key '${key}' cannot have null or undefined value.`,
      );
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' cannot be an empty string.`,
        );
      }
      if (trimmed.length > RetrievalMetadataFilter.MAX_STRING_LENGTH) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' string length ${trimmed.length} exceeds maximum ${RetrievalMetadataFilter.MAX_STRING_LENGTH}.`,
        );
      }

      // Reject control characters
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x1F\x7F]/.test(trimmed)) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' contains prohibited control characters.`,
        );
      }

      // Reject SQL injection fragments
      for (const pattern of DANGEROUS_SQL_PATTERNS) {
        if (pattern.test(trimmed)) {
          throw new InvalidMetadataFilterException(
            `Metadata key '${key}' contains prohibited injection sequence.`,
          );
        }
      }

      return trimmed;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' numeric value must be a finite number (got ${value}).`,
        );
      }
      return value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      if (value.length > RetrievalMetadataFilter.MAX_ARRAY_LENGTH) {
        throw new InvalidMetadataFilterException(
          `Metadata key '${key}' array length ${value.length} exceeds maximum ${RetrievalMetadataFilter.MAX_ARRAY_LENGTH}.`,
        );
      }

      return Object.freeze(
        value.map((item, idx) => {
          if (typeof item !== 'string') {
            throw new InvalidMetadataFilterException(
              `Metadata key '${key}[${idx}]' must be a string.`,
            );
          }
          const trimmed = item.trim();
          if (trimmed.length > RetrievalMetadataFilter.MAX_STRING_LENGTH) {
            throw new InvalidMetadataFilterException(
              `Metadata key '${key}[${idx}]' string exceeds maximum length ${RetrievalMetadataFilter.MAX_STRING_LENGTH}.`,
            );
          }
          for (const pattern of DANGEROUS_SQL_PATTERNS) {
            if (pattern.test(trimmed)) {
              throw new InvalidMetadataFilterException(
                `Metadata key '${key}[${idx}]' contains prohibited injection sequence.`,
              );
            }
          }
          return trimmed;
        }),
      );
    }

    throw new InvalidMetadataFilterException(
      `Metadata key '${key}' contains unsupported type '${typeof value}'. Only primitive string, number, boolean, or string[] are supported.`,
    );
  }

  public toRecord(): Readonly<Record<string, unknown>> {
    return this._filter;
  }

  public has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this._filter, key);
  }

  public get(key: string): unknown {
    return this._filter[key];
  }

  public isEmpty(): boolean {
    return Object.keys(this._filter).length === 0;
  }
}
