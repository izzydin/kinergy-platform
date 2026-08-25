import { MaintenanceRecordId } from '../value-objects/maintenance-record-id.vo';
import { AssetId } from '../value-objects/asset-id.vo';
import { Money } from '../../inventory/value-objects/money.vo';

export interface AssetMaintenanceRecordProps {
  id: MaintenanceRecordId;
  assetId: AssetId;
  serviceDate: Date;
  description: string;
  cost: Money;
  performedBy: string;
  notes?: string;
  recordedByUserId: string;
  createdAt: Date;
}

/**
 * Immutable record of maintenance, inspection, repair, or calibration performed on a FixedAsset.
 */
export class AssetMaintenanceRecord {
  private readonly _id: MaintenanceRecordId;
  private readonly _assetId: AssetId;
  private readonly _serviceDate: Date;
  private readonly _description: string;
  private readonly _cost: Money;
  private readonly _performedBy: string;
  private readonly _notes?: string;
  private readonly _recordedByUserId: string;
  private readonly _createdAt: Date;

  private constructor(props: AssetMaintenanceRecordProps) {
    if (!props.description || props.description.trim().length < 3) {
      throw new Error('Maintenance description must be at least 3 characters.');
    }
    if (!props.performedBy || props.performedBy.trim().length === 0) {
      throw new Error('PerformedBy technician or service provider is mandatory.');
    }
    if (!props.recordedByUserId || props.recordedByUserId.trim().length === 0) {
      throw new Error('RecordedByUserId is mandatory for maintenance audit log.');
    }

    this._id = props.id;
    this._assetId = props.assetId;
    this._serviceDate = new Date(props.serviceDate.getTime());
    this._description = props.description.trim();
    this._cost = props.cost;
    this._performedBy = props.performedBy.trim();
    this._notes = props.notes?.trim() || undefined;
    this._recordedByUserId = props.recordedByUserId.trim();
    this._createdAt = new Date(props.createdAt.getTime());

    Object.freeze(this);
  }

  public static create(
    props: Omit<AssetMaintenanceRecordProps, 'id' | 'createdAt'> & {
      id?: MaintenanceRecordId;
      createdAt?: Date;
    },
  ): AssetMaintenanceRecord {
    return new AssetMaintenanceRecord({
      ...props,
      id: props.id ?? MaintenanceRecordId.create(),
      createdAt: props.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: AssetMaintenanceRecordProps): AssetMaintenanceRecord {
    return new AssetMaintenanceRecord(props);
  }

  public get id(): MaintenanceRecordId {
    return this._id;
  }

  public get assetId(): AssetId {
    return this._assetId;
  }

  public get serviceDate(): Date {
    return new Date(this._serviceDate.getTime());
  }

  public get description(): string {
    return this._description;
  }

  public get cost(): Money {
    return this._cost;
  }

  public get performedBy(): string {
    return this._performedBy;
  }

  public get notes(): string | undefined {
    return this._notes;
  }

  public get recordedByUserId(): string {
    return this._recordedByUserId;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public toJSON(): Record<string, unknown> {
    return {
      id: this._id.value,
      assetId: this._assetId.value,
      serviceDate: this._serviceDate.toISOString(),
      description: this._description,
      cost: this._cost.toJSON(),
      performedBy: this._performedBy,
      notes: this._notes,
      recordedByUserId: this._recordedByUserId,
      createdAt: this._createdAt.toISOString(),
    };
  }
}
