import { VisibilityScope } from '../enums/visibility-scope.enum';
import { InvalidRetrievalQueryException } from '../exceptions/retrieval.exceptions';
import { RetrievalErrorCode } from '../enums/retrieval-error-code.enum';
import { RetrievalMetadataFilter } from './retrieval-metadata-filter.vo';

export interface CreateRetrievalCriteriaProps {
  tenantId: string;
  generationId?: string;
  documentIds?: string[];
  allowedVisibilityScopes?: readonly VisibilityScope[];
  mimeTypes?: string[];
  createdFrom?: Date;
  createdTo?: Date;
  metadataFilter?: RetrievalMetadataFilter | Record<string, unknown>;
}

/**
 * Value Object representing authorization and operational criteria applied
 * to a vector similarity search BEFORE ranking and LIMIT.
 *
 * Invariant: Tenant isolation is mandatory.
 */
export class RetrievalCriteria {
  public readonly tenantId: string;
  public readonly generationId?: string;
  public readonly documentIds?: readonly string[];
  public readonly allowedVisibilityScopes?: readonly VisibilityScope[];
  public readonly mimeTypes?: readonly string[];
  public readonly createdFrom?: Date;
  public readonly createdTo?: Date;
  public readonly metadataFilter?: Readonly<Record<string, unknown>>;

  private constructor(props: {
    tenantId: string;
    generationId?: string;
    documentIds?: readonly string[];
    allowedVisibilityScopes?: readonly VisibilityScope[];
    mimeTypes?: readonly string[];
    createdFrom?: Date;
    createdTo?: Date;
    metadataFilter?: Readonly<Record<string, unknown>>;
  }) {
    this.tenantId = props.tenantId;
    this.generationId = props.generationId;
    this.documentIds = props.documentIds;
    this.allowedVisibilityScopes = props.allowedVisibilityScopes;
    this.mimeTypes = props.mimeTypes;
    this.createdFrom = props.createdFrom;
    this.createdTo = props.createdTo;
    this.metadataFilter = props.metadataFilter;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievalCriteriaProps): RetrievalCriteria {
    if (!props.tenantId || typeof props.tenantId !== 'string' || !props.tenantId.trim()) {
      throw new InvalidRetrievalQueryException(
        'RetrievalCriteria requires a non-empty tenantId.',
        RetrievalErrorCode.RETRIEVAL_UNAUTHORIZED,
      );
    }

    const cleanTenantId = props.tenantId.trim();
    const cleanGenId =
      props.generationId &&
      typeof props.generationId === 'string' &&
      props.generationId.trim().length > 0
        ? props.generationId.trim()
        : undefined;

    let cleanDocIds: readonly string[] | undefined;
    if (props.documentIds && props.documentIds.length > 0) {
      const sanitized = props.documentIds.map((d) => d.trim()).filter((d) => d.length > 0);
      if (sanitized.length > 0) {
        cleanDocIds = Object.freeze([...new Set(sanitized)]);
      }
    }

    let cleanScopes: readonly VisibilityScope[] | undefined;
    if (props.allowedVisibilityScopes && props.allowedVisibilityScopes.length > 0) {
      cleanScopes = Object.freeze([...new Set(props.allowedVisibilityScopes)]);
    }

    let cleanMimeTypes: readonly string[] | undefined;
    if (props.mimeTypes && props.mimeTypes.length > 0) {
      const sanitizedMimes = props.mimeTypes
        .map((m) => m.trim().toLowerCase())
        .filter((m) => m.length > 0);
      if (sanitizedMimes.length > 0) {
        cleanMimeTypes = Object.freeze([...new Set(sanitizedMimes)]);
      }
    }

    if (props.createdFrom && props.createdTo && props.createdFrom > props.createdTo) {
      throw new InvalidRetrievalQueryException(
        'createdFrom cannot be after createdTo in RetrievalCriteria.',
        RetrievalErrorCode.INVALID_RETRIEVAL_CONFIG,
      );
    }

    const cleanFilter =
      props.metadataFilter instanceof RetrievalMetadataFilter
        ? props.metadataFilter
        : RetrievalMetadataFilter.create(props.metadataFilter);

    return new RetrievalCriteria({
      tenantId: cleanTenantId,
      generationId: cleanGenId,
      documentIds: cleanDocIds,
      allowedVisibilityScopes: cleanScopes,
      mimeTypes: cleanMimeTypes,
      createdFrom: props.createdFrom ? new Date(props.createdFrom.getTime()) : undefined,
      createdTo: props.createdTo ? new Date(props.createdTo.getTime()) : undefined,
      metadataFilter: cleanFilter.isEmpty() ? undefined : cleanFilter.toRecord(),
    });
  }
}
