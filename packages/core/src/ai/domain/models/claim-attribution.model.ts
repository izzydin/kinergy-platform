export interface CreateClaimAttributionProps {
  claim: string;
  chunkId: string;
  isVerified: boolean;
  documentTitle?: string;
  pageNumber?: number;
}

/**
 * Value Object representing a single factual statement or claim and its
 * associated evidence citation status.
 */
export class ClaimAttribution {
  public readonly claim: string;
  public readonly chunkId: string;
  public readonly isVerified: boolean;
  public readonly documentTitle?: string;
  public readonly pageNumber?: number;

  private constructor(props: CreateClaimAttributionProps) {
    this.claim = props.claim;
    this.chunkId = props.chunkId;
    this.isVerified = props.isVerified;
    this.documentTitle = props.documentTitle;
    this.pageNumber = props.pageNumber;
    Object.freeze(this);
  }

  public static create(props: CreateClaimAttributionProps): ClaimAttribution {
    if (!props.claim || typeof props.claim !== 'string' || props.claim.trim().length === 0) {
      throw new Error('ClaimAttribution claim must be a non-empty string.');
    }
    if (!props.chunkId || typeof props.chunkId !== 'string' || props.chunkId.trim().length === 0) {
      throw new Error('ClaimAttribution chunkId must be a non-empty string.');
    }
    return new ClaimAttribution(props);
  }
}
