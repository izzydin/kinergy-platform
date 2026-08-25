import { ValueObject } from '../../shared/value-object';
import { InvalidInventoryItemStateException } from '../exceptions/invalid-inventory-item-state.exception';

export interface LocationRefProps {
  facilityId: string;
  roomRef?: string;
  binCode?: string;
  shelf?: string;
}

/**
 * Value Object representing a structured physical location reference for inventory storage.
 */
export class LocationRef implements ValueObject<LocationRefProps> {
  private readonly _facilityId: string;
  private readonly _roomRef?: string;
  private readonly _binCode?: string;
  private readonly _shelf?: string;

  private constructor(props: LocationRefProps) {
    if (
      !props.facilityId ||
      typeof props.facilityId !== 'string' ||
      props.facilityId.trim().length === 0
    ) {
      throw new InvalidInventoryItemStateException('LocationRef must have a valid facilityId.');
    }
    this._facilityId = props.facilityId.trim();
    this._roomRef = props.roomRef?.trim();
    this._binCode = props.binCode?.trim();
    this._shelf = props.shelf?.trim();
    Object.freeze(this);
  }

  public static create(props: LocationRefProps): LocationRef {
    return new LocationRef(props);
  }

  public get facilityId(): string {
    return this._facilityId;
  }

  public get roomRef(): string | undefined {
    return this._roomRef;
  }

  public get binCode(): string | undefined {
    return this._binCode;
  }

  public get shelf(): string | undefined {
    return this._shelf;
  }

  public getValue(): LocationRefProps {
    return {
      facilityId: this._facilityId,
      roomRef: this._roomRef,
      binCode: this._binCode,
      shelf: this._shelf,
    };
  }

  public equals(other: ValueObject<LocationRefProps>): boolean {
    if (!other || !(other instanceof LocationRef)) {
      return false;
    }
    return (
      this._facilityId === other.facilityId &&
      this._roomRef === other.roomRef &&
      this._binCode === other.binCode &&
      this._shelf === other.shelf
    );
  }
}
