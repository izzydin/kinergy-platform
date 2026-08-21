import type {
  FilterParserMap,
  FilterSerializerMap,
  SortState,
} from '../types/table-url-state.types';

/**
 * Parses a serialized sort query string into a structured SortState object.
 *
 * Supported formats:
 * - "field.asc"  -> { id: "field", desc: false }
 * - "field.desc" -> { id: "field", desc: true }
 * - "field"      -> { id: "field", desc: false }
 *
 * Returns undefined for empty or malformed strings.
 */
export function parseSortParam(raw: string | null | undefined): SortState | undefined {
  if (!raw || typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const parts = trimmed.split('.');
  if (parts.length === 1) {
    const id = parts[0];
    return id ? { id, desc: false } : undefined;
  }

  if (parts.length === 2) {
    const [id, dir] = parts;
    if (!id || !dir) {
      return undefined;
    }
    const lowerDir = dir.toLowerCase();
    if (lowerDir === 'asc') {
      return { id, desc: false };
    }
    if (lowerDir === 'desc') {
      return { id, desc: true };
    }
  }

  // Malformed sort format with >2 parts or invalid direction
  return undefined;
}

/**
 * Serializes a SortState object into a standardized URL parameter string.
 *
 * Examples:
 * - { id: "name", desc: false } -> "name.asc"
 * - { id: "createdAt", desc: true } -> "createdAt.desc"
 */
export function serializeSortParam(sortState: SortState | string | undefined): string | undefined {
  if (!sortState) {
    return undefined;
  }

  if (typeof sortState === 'string') {
    const parsed = parseSortParam(sortState);
    return parsed ? `${parsed.id}.${parsed.desc ? 'desc' : 'asc'}` : undefined;
  }

  if (!sortState.id) {
    return undefined;
  }

  return `${sortState.id}.${sortState.desc ? 'desc' : 'asc'}`;
}

/**
 * Parses and sanitizes a 1-based page query parameter.
 * Returns defaultPage (default: 1) if raw value is missing, non-numeric, or < 1.
 */
export function parsePageParam(raw: string | null | undefined, defaultPage = 1): number {
  if (!raw || typeof raw !== 'string') {
    return Math.max(1, defaultPage);
  }

  const parsed = parseInt(raw.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return Math.max(1, defaultPage);
  }

  return parsed;
}

/**
 * Parses and sanitizes a page size limit query parameter.
 * Validates against optional allowedLimits list and falls back to defaultLimit.
 */
export function parseLimitParam(
  raw: string | null | undefined,
  defaultLimit = 10,
  allowedLimits?: readonly number[],
): number {
  const fallback = Math.max(1, defaultLimit);
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  const parsed = parseInt(raw.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  if (allowedLimits && allowedLimits.length > 0) {
    return allowedLimits.includes(parsed) ? parsed : fallback;
  }

  return parsed;
}

/**
 * Parses filter query parameters from URLSearchParams using a schema of parser functions.
 */
export function parseFilterParams<TFilters extends object = Record<string, unknown>>(
  searchParams: URLSearchParams,
  filterParsers?: FilterParserMap<TFilters>,
): TFilters {
  const result: Record<string, unknown> = {};

  if (!filterParsers) {
    return result as TFilters;
  }

  for (const key of Object.keys(filterParsers) as Array<keyof TFilters>) {
    const parser = filterParsers[key];
    if (typeof parser === 'function') {
      const raw = searchParams.get(String(key));
      const parsed = parser(raw);
      if (parsed !== undefined) {
        result[key as string] = parsed;
      }
    }
  }

  return result as TFilters;
}

/**
 * Serializes filter values into a URLSearchParams instance.
 * Automatically removes keys with null, undefined, or empty string values.
 */
export function serializeFilterParams<TFilters extends object = Record<string, unknown>>(
  filters: Partial<TFilters>,
  searchParams: URLSearchParams,
  filterSerializers?: FilterSerializerMap<TFilters>,
): void {
  for (const key of Object.keys(filters) as Array<keyof TFilters>) {
    const value = filters[key];
    const keyStr = String(key);

    if (value === undefined || value === null || value === '') {
      searchParams.delete(keyStr);
      continue;
    }

    const serializer = filterSerializers?.[key];
    if (typeof serializer === 'function') {
      const serialized = serializer(value as TFilters[keyof TFilters]);
      if (serialized !== undefined && serialized !== null && serialized !== '') {
        searchParams.set(keyStr, serialized);
      } else {
        searchParams.delete(keyStr);
      }
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      searchParams.set(keyStr, String(value));
    } else {
      searchParams.set(keyStr, JSON.stringify(value));
    }
  }
}
