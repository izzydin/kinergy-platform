import { ValueObject } from '../shared/value-object';
import { ReceiptDomainException } from '../exceptions/receipt-domain.exception';

export interface ReceiptClientSnapshotProps {
  clientId: string;
  referenceNumber?: string | null;
  fullName: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * Immutable Value Object capturing point-in-time client presentation attributes
 * at the moment of Receipt issuance.
 *
 * Guarantees that historical customer vouchers remain 100% frozen even if the
 * client's legal name, reference number, or contact info changes in the future.
 * Codified by ADR-0110 and ADR-0117.
 */
export class ReceiptClientSnapshot implements ValueObject<ReceiptClientSnapshotProps> {
  private readonly _clientId: string;
  private readonly _referenceNumber: string | null;
  private readonly _fullName: string;
  private readonly _email: string | null;
  private readonly _phone: string | null;

  private constructor(props: ReceiptClientSnapshotProps) {
    if (!props) {
      throw new ReceiptDomainException(
        'ReceiptClientSnapshotProps cannot be null or undefined.',
        'INVALID_RECEIPT_CLIENT_SNAPSHOT',
      );
    }

    if (
      !props.clientId ||
      typeof props.clientId !== 'string' ||
      props.clientId.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Client snapshot clientId must be a non-empty string.',
        'INVALID_RECEIPT_CLIENT_SNAPSHOT',
      );
    }

    if (
      !props.fullName ||
      typeof props.fullName !== 'string' ||
      props.fullName.trim().length === 0
    ) {
      throw new ReceiptDomainException(
        'Client snapshot fullName must be a non-empty string.',
        'INVALID_RECEIPT_CLIENT_SNAPSHOT',
      );
    }

    this._clientId = props.clientId.trim();
    this._referenceNumber =
      props.referenceNumber && typeof props.referenceNumber === 'string'
        ? props.referenceNumber.trim()
        : null;
    this._fullName = props.fullName.trim();
    this._email = props.email && typeof props.email === 'string' ? props.email.trim() : null;
    this._phone = props.phone && typeof props.phone === 'string' ? props.phone.trim() : null;

    Object.freeze(this);
  }

  public static create(props: ReceiptClientSnapshotProps): ReceiptClientSnapshot {
    return new ReceiptClientSnapshot(props);
  }

  /**
   * Factory method to create a point-in-time snapshot from ClientSummaryDto or summary-like object.
   */
  public static fromSummary(summary: {
    id: string;
    referenceNumber?: string | null;
    fullName: string;
    email?: string | null;
    phone?: string | null;
  }): ReceiptClientSnapshot {
    if (!summary) {
      throw new ReceiptDomainException(
        'Client summary cannot be null or undefined when creating client snapshot.',
        'INVALID_RECEIPT_CLIENT_SNAPSHOT',
      );
    }
    return new ReceiptClientSnapshot({
      clientId: summary.id,
      referenceNumber: summary.referenceNumber,
      fullName: summary.fullName,
      email: summary.email,
      phone: summary.phone,
    });
  }

  public get clientId(): string {
    return this._clientId;
  }

  public get referenceNumber(): string | null {
    return this._referenceNumber;
  }

  public get fullName(): string {
    return this._fullName;
  }

  public get email(): string | null {
    return this._email;
  }

  public get phone(): string | null {
    return this._phone;
  }

  public getValue(): ReceiptClientSnapshotProps {
    return {
      clientId: this._clientId,
      referenceNumber: this._referenceNumber,
      fullName: this._fullName,
      email: this._email,
      phone: this._phone,
    };
  }

  public equals(other: ValueObject<ReceiptClientSnapshotProps> | undefined | null): boolean {
    if (!other || !(other instanceof ReceiptClientSnapshot)) {
      return false;
    }
    return (
      this._clientId === other.clientId &&
      this._referenceNumber === other.referenceNumber &&
      this._fullName === other.fullName &&
      this._email === other.email &&
      this._phone === other.phone
    );
  }
}
