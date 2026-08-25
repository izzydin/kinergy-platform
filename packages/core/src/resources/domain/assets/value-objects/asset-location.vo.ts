import { ValueObject } from '../../shared/value-object';
import { InvalidAssetLocationException } from '../exceptions/invalid-asset-location.exception';

export interface AssetLocationProps {
  facilityId: string;
  roomId?: string;
  zone?: string;
  description?: string;
}

export class AssetLocation implements ValueObject<AssetLocationProps> {
  private readonly _facilityId: string;
  private readonly _roomId?: string;
  private readonly _zone?: string;
  private readonly _description?: string;

  private constructor(props: AssetLocationProps) {
    if (
      !props ||
      !props.facilityId ||
      typeof props.facilityId !== 'string' ||
      props.facilityId.trim().length === 0
    ) {
      throw new InvalidAssetLocationException('Facility ID is mandatory for asset location.');
    }

    this._facilityId = props.facilityId.trim();

    if (props.roomId !== undefined && props.roomId !== null) {
      const trimmedRoom = props.roomId.trim();
      if (trimmedRoom.length === 0) {
        throw new InvalidAssetLocationException('Room ID cannot be empty string if provided.');
      }
      this._roomId = trimmedRoom;
    }

    if (props.zone !== undefined && props.zone !== null) {
      const trimmedZone = props.zone.trim();
      if (trimmedZone.length === 0) {
        throw new InvalidAssetLocationException('Zone cannot be empty string if provided.');
      }
      this._zone = trimmedZone;
    }

    if (props.description !== undefined && props.description !== null) {
      const trimmedDesc = props.description.trim();
      if (trimmedDesc.length > 255) {
        throw new InvalidAssetLocationException(
          'Location description cannot exceed 255 characters.',
        );
      }
      this._description = trimmedDesc;
    }

    Object.freeze(this);
  }

  public static create(props: AssetLocationProps): AssetLocation {
    return new AssetLocation(props);
  }

  public get facilityId(): string {
    return this._facilityId;
  }

  public get roomId(): string | undefined {
    return this._roomId;
  }

  public get zone(): string | undefined {
    return this._zone;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public getValue(): AssetLocationProps {
    return {
      facilityId: this._facilityId,
      ...(this._roomId !== undefined && { roomId: this._roomId }),
      ...(this._zone !== undefined && { zone: this._zone }),
      ...(this._description !== undefined && { description: this._description }),
    };
  }

  public toJSON(): AssetLocationProps {
    return this.getValue();
  }

  public equals(other: ValueObject<AssetLocationProps>): boolean {
    if (!other || !(other instanceof AssetLocation)) {
      return false;
    }
    return (
      this._facilityId === other.facilityId &&
      this._roomId === other.roomId &&
      this._zone === other.zone &&
      this._description === other.description
    );
  }

  public toString(): string {
    const parts = [`Facility: ${this._facilityId}`];
    if (this._roomId) parts.push(`Room: ${this._roomId}`);
    if (this._zone) parts.push(`Zone: ${this._zone}`);
    if (this._description) parts.push(`(${this._description})`);
    return parts.join(' | ');
  }
}
