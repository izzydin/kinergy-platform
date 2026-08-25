import { AssetHistoryId } from '../value-objects/asset-history-id.vo';
import { AssetId } from '../value-objects/asset-id.vo';
import { AssetHistoryEventType } from '../enums/asset-history-event-type.enum';

export interface AssetHistoryEventProps {
  id: AssetHistoryId;
  assetId: AssetId;
  eventType: AssetHistoryEventType;
  description: string;
  details?: Record<string, unknown>;
  recordedByUserId: string;
  recordedAt: Date;
}

/**
 * Immutable historical audit entry capturing state transitions, location transfers,
 * condition updates, and maintenance events for a FixedAsset.
 */
export class AssetHistoryEvent {
  private readonly _id: AssetHistoryId;
  private readonly _assetId: AssetId;
  private readonly _eventType: AssetHistoryEventType;
  private readonly _description: string;
  private readonly _details?: Record<string, unknown>;
  private readonly _recordedByUserId: string;
  private readonly _recordedAt: Date;

  private constructor(props: AssetHistoryEventProps) {
    if (!props.description || props.description.trim().length < 3) {
      throw new Error('History event description must be at least 3 characters.');
    }
    if (!props.recordedByUserId || props.recordedByUserId.trim().length === 0) {
      throw new Error('RecordedByUserId is mandatory for asset history provenance.');
    }

    this._id = props.id;
    this._assetId = props.assetId;
    this._eventType = props.eventType;
    this._description = props.description.trim();
    this._details = props.details ? { ...props.details } : undefined;
    this._recordedByUserId = props.recordedByUserId.trim();
    this._recordedAt = new Date(props.recordedAt.getTime());

    Object.freeze(this);
  }

  public static create(
    props: Omit<AssetHistoryEventProps, 'id' | 'recordedAt'> & {
      id?: AssetHistoryId;
      recordedAt?: Date;
    },
  ): AssetHistoryEvent {
    return new AssetHistoryEvent({
      ...props,
      id: props.id ?? AssetHistoryId.create(),
      recordedAt: props.recordedAt ?? new Date(),
    });
  }

  public static reconstitute(props: AssetHistoryEventProps): AssetHistoryEvent {
    return new AssetHistoryEvent(props);
  }

  public get id(): AssetHistoryId {
    return this._id;
  }

  public get assetId(): AssetId {
    return this._assetId;
  }

  public get eventType(): AssetHistoryEventType {
    return this._eventType;
  }

  public get description(): string {
    return this._description;
  }

  public get details(): Record<string, unknown> | undefined {
    return this._details ? { ...this._details } : undefined;
  }

  public get recordedByUserId(): string {
    return this._recordedByUserId;
  }

  public get recordedAt(): Date {
    return new Date(this._recordedAt.getTime());
  }

  public toJSON(): Record<string, unknown> {
    return {
      id: this._id.value,
      assetId: this._assetId.value,
      eventType: this._eventType,
      description: this._description,
      details: this._details,
      recordedByUserId: this._recordedByUserId,
      recordedAt: this._recordedAt.toISOString(),
    };
  }
}
