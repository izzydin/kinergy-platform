import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { AssetId } from './value-objects/asset-id.vo';
import { AssetLocation } from './value-objects/asset-location.vo';
import { Money } from '../inventory/value-objects/money.vo';
import { AssetCategory, isAssetCategory } from './enums/asset-category.enum';
import { AssetStatus, isAssetStatus, isTerminalAssetStatus } from './enums/asset-status.enum';
import { AssetCondition, isAssetCondition } from './enums/asset-condition.enum';
import { AssetHistoryEventType } from './enums/asset-history-event-type.enum';
import { AssetHistoryEvent } from './entities/asset-history-event.entity';
import { AssetMaintenanceRecord } from './entities/asset-maintenance-record.entity';
import { InvalidAssetStateException } from './exceptions/invalid-asset-state.exception';
import { AssetLifecycleStateMachine } from './services/asset-lifecycle.state-machine';
import {
  AssetCreatedDomainEvent,
  AssetTransferredDomainEvent,
  AssetStatusChangedDomainEvent,
  AssetConditionChangedDomainEvent,
  AssetValuationUpdatedDomainEvent,
  AssetMaintenanceRecordedDomainEvent,
  AssetRetiredDomainEvent,
  AssetSoldDomainEvent,
} from './events';

export interface CreateFixedAssetProps {
  id?: AssetId;
  tenantId?: string;
  assetTag: string;
  name: string;
  description?: string;
  category: AssetCategory;
  purchaseDate: Date;
  purchaseValue: Money;
  currentEstimatedValue?: Money;
  condition?: AssetCondition;
  status?: AssetStatus;
  location: AssetLocation;
  notes?: string;
}

export interface ReconstituteFixedAssetProps {
  id: AssetId;
  tenantId?: string;
  assetTag: string;
  name: string;
  description?: string;
  category: AssetCategory;
  purchaseDate: Date;
  purchaseValue: Money;
  currentEstimatedValue: Money;
  condition: AssetCondition;
  status: AssetStatus;
  location: AssetLocation;
  notes?: string;
  historyEvents?: AssetHistoryEvent[];
  maintenanceRecords?: AssetMaintenanceRecord[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecordMaintenanceParams {
  serviceDate: Date;
  description: string;
  cost: Money;
  performedBy: string;
  notes?: string;
  updateConditionTo?: AssetCondition;
}

const TAG_REGEX = /^[A-Z0-9_-]{3,32}$/i;

/**
 * Aggregate Root governing non-fungible capital physical equipment,
 * clinical devices, gym machinery, and facility assets.
 */
export class FixedAsset implements AggregateRoot<AssetId> {
  private readonly _id: AssetId;
  private readonly _tenantId?: string;
  private _assetTag: string;
  private _name: string;
  private _description?: string;
  private _category: AssetCategory;
  private readonly _purchaseDate: Date;
  private readonly _purchaseValue: Money;
  private _currentEstimatedValue: Money;
  private _condition: AssetCondition;
  private _status: AssetStatus;
  private _location: AssetLocation;
  private _notes?: string;
  private readonly _historyEvents: AssetHistoryEvent[] = [];
  private readonly _maintenanceRecords: AssetMaintenanceRecord[] = [];
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(props: ReconstituteFixedAssetProps) {
    this._id = props.id;
    this._tenantId = props.tenantId?.trim() || undefined;
    this._assetTag = FixedAsset.validateAssetTag(props.assetTag);
    this._name = FixedAsset.validateName(props.name);
    this._description = props.description?.trim() || undefined;
    this._category = FixedAsset.validateCategory(props.category);
    this._purchaseDate = FixedAsset.validatePurchaseDate(props.purchaseDate);
    this._purchaseValue = props.purchaseValue;
    this._currentEstimatedValue = props.currentEstimatedValue;
    this._condition = FixedAsset.validateCondition(props.condition);
    this._status = FixedAsset.validateStatus(props.status);
    this._location = props.location;
    this._notes = props.notes?.trim() || undefined;
    this._historyEvents = props.historyEvents ? [...props.historyEvents] : [];
    this._maintenanceRecords = props.maintenanceRecords ? [...props.maintenanceRecords] : [];
    this._version = props.version;
    this._createdAt = new Date(props.createdAt.getTime());
    this._updatedAt = new Date(props.updatedAt.getTime());
  }

  /**
   * Factory method to create and register a new FixedAsset.
   */
  public static create(props: CreateFixedAssetProps, actorId: string): FixedAsset {
    if (!actorId || actorId.trim().length === 0) {
      throw new InvalidAssetStateException('Actor ID is mandatory when registering a fixed asset.');
    }

    const assetId = props.id ?? AssetId.create();
    const condition = props.condition ?? AssetCondition.EXCELLENT;
    const status = props.status ?? AssetStatus.ACTIVE;
    AssetLifecycleStateMachine.assertValidInitialStatus(status);
    const estimatedValue = props.currentEstimatedValue ?? props.purchaseValue;
    const now = new Date();

    const asset = new FixedAsset({
      id: assetId,
      tenantId: props.tenantId,
      assetTag: props.assetTag,
      name: props.name,
      description: props.description,
      category: props.category,
      purchaseDate: props.purchaseDate,
      purchaseValue: props.purchaseValue,
      currentEstimatedValue: estimatedValue,
      condition,
      status,
      location: props.location,
      notes: props.notes,
      historyEvents: [],
      maintenanceRecords: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    const initialHistory = AssetHistoryEvent.create({
      assetId,
      eventType: AssetHistoryEventType.CREATED,
      description: `Asset registered and commissioned at ${props.location.toString()}`,
      details: {
        assetTag: asset._assetTag,
        category: asset._category,
        purchaseValue: asset._purchaseValue.toJSON(),
        condition: asset._condition,
        status: asset._status,
        location: props.location.toJSON(),
      },
      recordedByUserId: actorId,
      recordedAt: now,
    });

    asset._historyEvents.push(initialHistory);

    asset.addDomainEvent(
      new AssetCreatedDomainEvent(
        assetId.value,
        1,
        {
          assetTag: asset._assetTag,
          name: asset._name,
          category: asset._category,
          purchaseValueAmount: asset._purchaseValue.amount,
          purchaseValueCurrency: asset._purchaseValue.currency,
          condition: asset._condition,
          status: asset._status,
          facilityId: props.location.facilityId,
          actorId,
        },
        now,
      ),
    );

    return asset;
  }

  /**
   * Reconstitute an aggregate instance from persistence.
   */
  public static reconstitute(props: ReconstituteFixedAssetProps): FixedAsset {
    return new FixedAsset(props);
  }

  // ==========================================
  // GETTERS & EVENT MANAGEMENT
  // ==========================================

  public get id(): AssetId {
    return this._id;
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  public get tenantId(): string | undefined {
    return this._tenantId;
  }

  public get assetTag(): string {
    return this._assetTag;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public get category(): AssetCategory {
    return this._category;
  }

  public get purchaseDate(): Date {
    return new Date(this._purchaseDate.getTime());
  }

  public get purchaseValue(): Money {
    return this._purchaseValue;
  }

  public get currentEstimatedValue(): Money {
    return this._currentEstimatedValue;
  }

  public get condition(): AssetCondition {
    return this._condition;
  }

  public get status(): AssetStatus {
    return this._status;
  }

  public get location(): AssetLocation {
    return this._location;
  }

  public get notes(): string | undefined {
    return this._notes;
  }

  public get historyEvents(): readonly AssetHistoryEvent[] {
    return Object.freeze([...this._historyEvents]);
  }

  public get maintenanceRecords(): readonly AssetMaintenanceRecord[] {
    return Object.freeze([...this._maintenanceRecords]);
  }

  public get version(): number {
    return this._version;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this._updatedAt.getTime());
  }

  // ==========================================
  // BEHAVIORAL DOMAIN OPERATIONS
  // ==========================================

  /**
   * Update descriptive metadata (name, description, notes).
   */
  /**
   * Update mutable descriptive attributes (name, description, notes).
   * Meaningful changes record an UPDATED history event; no-ops produce no history.
   * Invariant [AST-INV-1].
   */
  public updateDetails(
    params: { name?: string; description?: string; notes?: string },
    actorId: string,
    reason?: string,
  ): void {
    this.assertNotSold('update details on');
    this.assertActor(actorId);

    const changedFields: Record<string, { from: unknown; to: unknown }> = {};

    if (params.name !== undefined) {
      const validatedName = FixedAsset.validateName(params.name);
      if (validatedName !== this._name) {
        changedFields['name'] = { from: this._name, to: validatedName };
        this._name = validatedName;
      }
    }

    if (params.description !== undefined) {
      const trimmedDesc = params.description.trim() || undefined;
      if (trimmedDesc !== this._description) {
        changedFields['description'] = { from: this._description, to: trimmedDesc };
        this._description = trimmedDesc;
      }
    }

    if (params.notes !== undefined) {
      const trimmedNotes = params.notes.trim() || undefined;
      if (trimmedNotes !== this._notes) {
        changedFields['notes'] = { from: this._notes, to: trimmedNotes };
        this._notes = trimmedNotes;
      }
    }

    const changedKeys = Object.keys(changedFields);
    if (changedKeys.length === 0) {
      return; // Meaningless technical no-op update; produce NO history event
    }

    const eventDesc = reason?.trim()
      ? `Asset details updated (${changedKeys.join(', ')}): ${reason.trim()}`
      : `Asset details updated (${changedKeys.join(', ')})`;

    this.appendHistoryAndTouch(actorId, AssetHistoryEventType.UPDATED, eventDesc, {
      changedFields,
      reason: reason?.trim() || undefined,
    });
  }

  /**
   * Transfer physical location of the asset.
   * Invariant [AST-INV-1], [AST-INV-2], [AST-INV-3].
   */
  public transferLocation(newLocation: AssetLocation, actorId: string, reason?: string): void {
    this.assertNotSold('transfer');
    this.assertNotRetired('transfer');
    this.assertActor(actorId);

    if (this._location.equals(newLocation)) {
      return; // Idempotent no-op
    }

    const priorLocation = this._location;
    this._location = newLocation;

    const eventDesc = reason?.trim()
      ? `Location transferred from [${priorLocation.toString()}] to [${newLocation.toString()}]: ${reason.trim()}`
      : `Location transferred from [${priorLocation.toString()}] to [${newLocation.toString()}]`;

    this.appendHistoryAndTouch(actorId, AssetHistoryEventType.TRANSFERRED, eventDesc, {
      priorLocation: priorLocation.toJSON(),
      newLocation: newLocation.toJSON(),
      reason: reason?.trim() || undefined,
    });

    this.addDomainEvent(
      new AssetTransferredDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          priorLocation: priorLocation.getValue(),
          newLocation: newLocation.getValue(),
          actorId,
          reason,
        },
        this._updatedAt,
      ),
    );
  }

  /**
   * Change operational status (e.g. ACTIVE -> UNDER_MAINTENANCE).
   * Invariant [AST-INV-1], [AST-INV-4].
   */
  public changeStatus(newStatus: AssetStatus, actorId: string, reason: string): void {
    this.assertNotSold('change status of');
    this.assertActor(actorId);

    if (!reason || reason.trim().length < 3) {
      throw new InvalidAssetStateException(
        'Mandatory reason for status change must be at least 3 characters.',
      );
    }

    const validatedStatus = FixedAsset.validateStatus(newStatus);

    if (validatedStatus === AssetStatus.SOLD) {
      throw new InvalidAssetStateException(
        "Direct status change to 'SOLD' is prohibited. Use the sell() method to record liquidation value.",
      );
    }

    if (validatedStatus === AssetStatus.RETIRED) {
      this.retire(actorId, reason);
      return;
    }

    AssetLifecycleStateMachine.assertTransitionValid(this._status, validatedStatus);

    const priorStatus = this._status;
    this._status = validatedStatus;

    const eventDesc = `Status changed from ${priorStatus} to ${validatedStatus}: ${reason.trim()}`;

    this.appendHistoryAndTouch(actorId, AssetHistoryEventType.STATUS_CHANGED, eventDesc, {
      priorStatus,
      newStatus: validatedStatus,
      reason: reason.trim(),
    });

    this.addDomainEvent(
      new AssetStatusChangedDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          priorStatus,
          newStatus: validatedStatus,
          actorId,
          reason: reason.trim(),
        },
        this._updatedAt,
      ),
    );
  }

  /**
   * Transition asset to UNDER_MAINTENANCE status for inspection or repair.
   */
  public sendToMaintenance(actorId: string, reason: string): void {
    this.changeStatus(AssetStatus.UNDER_MAINTENANCE, actorId, reason);
  }

  /**
   * Mark asset as DAMAGED due to breakdown, defect, or safety incident.
   */
  public markAsDamaged(actorId: string, reason: string): void {
    this.changeStatus(AssetStatus.DAMAGED, actorId, reason);
  }

  /**
   * Restore asset to ACTIVE status from UNDER_MAINTENANCE or DAMAGED.
   */
  public restoreToActive(actorId: string, reason: string): void {
    if (this._condition === AssetCondition.OUT_OF_SERVICE) {
      throw new InvalidAssetStateException(
        `Cannot restore fixed asset '${this._assetTag}' to ACTIVE while condition is 'OUT_OF_SERVICE'. Perform repairs and update condition first.`,
      );
    }
    this.changeStatus(AssetStatus.ACTIVE, actorId, reason);
  }

  /**
   * Update physical condition rating.
   * Invariant [AST-INV-1], [AST-INV-5].
   */
  public updateCondition(newCondition: AssetCondition, actorId: string, reason?: string): void {
    this.assertNotSold('update condition of');
    this.assertActor(actorId);
    const validatedCondition = FixedAsset.validateCondition(newCondition);

    if (this._condition === validatedCondition) {
      return; // Idempotent no-op
    }

    const priorCondition = this._condition;
    this._condition = validatedCondition;

    const eventDesc = reason?.trim()
      ? `Condition changed from ${priorCondition} to ${validatedCondition}: ${reason.trim()}`
      : `Condition changed from ${priorCondition} to ${validatedCondition}`;

    this.appendHistoryAndTouch(actorId, AssetHistoryEventType.CONDITION_CHANGED, eventDesc, {
      priorCondition,
      newCondition: validatedCondition,
      reason: reason?.trim() || undefined,
    });

    this.addDomainEvent(
      new AssetConditionChangedDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          priorCondition,
          newCondition: validatedCondition,
          actorId,
          reason,
        },
        this._updatedAt,
      ),
    );
  }

  /**
   * Update estimated economic/book value.
   * Invariant [AST-INV-1], [AST-INV-8].
   */
  public updateEstimatedValue(newEstimatedValue: Money, actorId: string, reason?: string): void {
    this.assertNotSold('revalue');
    this.assertActor(actorId);

    if (this._currentEstimatedValue.equals(newEstimatedValue)) {
      return;
    }

    const priorValue = this._currentEstimatedValue;
    this._currentEstimatedValue = newEstimatedValue;

    const eventDesc = reason?.trim()
      ? `Estimated value updated from ${priorValue.toString()} to ${newEstimatedValue.toString()}: ${reason.trim()}`
      : `Estimated value updated from ${priorValue.toString()} to ${newEstimatedValue.toString()}`;

    this.appendHistoryAndTouch(actorId, AssetHistoryEventType.VALUE_UPDATED, eventDesc, {
      priorValue: priorValue.toJSON(),
      newValue: newEstimatedValue.toJSON(),
      reason: reason?.trim() || undefined,
    });

    this.addDomainEvent(
      new AssetValuationUpdatedDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          priorEstimatedValueAmount: priorValue.amount,
          newEstimatedValueAmount: newEstimatedValue.amount,
          currency: newEstimatedValue.currency,
          actorId,
          reason,
        },
        this._updatedAt,
      ),
    );
  }

  /**
   * Record servicing, inspection, or repair.
   * Invariant [AST-INV-1], [AST-INV-6].
   */
  public recordMaintenance(
    params: RecordMaintenanceParams,
    actorId: string,
  ): AssetMaintenanceRecord {
    this.assertNotSold('perform maintenance on');
    this.assertNotRetired('perform maintenance on');
    this.assertActor(actorId);

    const record = AssetMaintenanceRecord.create({
      assetId: this.id,
      serviceDate: params.serviceDate,
      description: params.description,
      cost: params.cost,
      performedBy: params.performedBy,
      notes: params.notes,
      recordedByUserId: actorId,
    });

    this._maintenanceRecords.push(record);

    if (params.updateConditionTo) {
      this._condition = FixedAsset.validateCondition(params.updateConditionTo);
    }

    // Automatically return from UNDER_MAINTENANCE or DAMAGED to ACTIVE upon servicing completion if condition is serviceable
    if (
      (this._status === AssetStatus.UNDER_MAINTENANCE || this._status === AssetStatus.DAMAGED) &&
      this._condition !== AssetCondition.OUT_OF_SERVICE &&
      this._condition !== AssetCondition.NEEDS_REPAIR
    ) {
      this._status = AssetStatus.ACTIVE;
    }

    this.appendHistoryAndTouch(
      actorId,
      AssetHistoryEventType.MAINTENANCE_RECORDED,
      `Maintenance recorded: ${params.description} ($${params.cost.amount.toFixed(2)} by ${params.performedBy})`,
      {
        maintenanceRecordId: record.id.value,
        cost: params.cost.toJSON(),
        performedBy: params.performedBy,
        serviceDate: params.serviceDate.toISOString(),
      },
    );

    this.addDomainEvent(
      new AssetMaintenanceRecordedDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          maintenanceRecordId: record.id.value,
          serviceDate: params.serviceDate,
          description: params.description,
          costAmount: params.cost.amount,
          costCurrency: params.cost.currency,
          performedBy: params.performedBy,
          actorId,
        },
        this._updatedAt,
      ),
    );

    return record;
  }

  /**
   * Decommission asset from active service.
   */
  public retire(actorId: string, reason: string): void {
    this.assertNotSold('retire');
    this.assertActor(actorId);

    if (!reason || reason.trim().length < 3) {
      throw new InvalidAssetStateException(
        'Mandatory retirement reason must be at least 3 characters.',
      );
    }

    AssetLifecycleStateMachine.assertTransitionValid(this._status, AssetStatus.RETIRED);

    if (this._status === AssetStatus.RETIRED) {
      return;
    }

    const priorStatus = this._status;
    this._status = AssetStatus.RETIRED;

    this.appendHistoryAndTouch(
      actorId,
      AssetHistoryEventType.RETIRED,
      `Asset decommissioned and retired: ${reason.trim()}`,
      {
        priorStatus,
        newStatus: AssetStatus.RETIRED,
        reason: reason.trim(),
      },
    );

    this.addDomainEvent(
      new AssetRetiredDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          reason: reason.trim(),
          actorId,
        },
        this._updatedAt,
      ),
    );
  }

  /**
   * Permanently sell asset for salvage / liquidation value (Terminal State).
   * Invariant [AST-INV-1].
   */
  public sell(saleAmount: Money, actorId: string, reason: string): void {
    this.assertNotSold('sell');
    this.assertActor(actorId);

    if (!reason || reason.trim().length < 3) {
      throw new InvalidAssetStateException(
        'Mandatory sale liquidation reason must be at least 3 characters.',
      );
    }

    AssetLifecycleStateMachine.assertTransitionValid(this._status, AssetStatus.SOLD);

    const priorStatus = this._status;
    const priorEstimatedValue = this._currentEstimatedValue;

    this._status = AssetStatus.SOLD;
    this._currentEstimatedValue = saleAmount;

    this.appendHistoryAndTouch(
      actorId,
      AssetHistoryEventType.SOLD,
      `Asset sold for ${saleAmount.toString()}: ${reason.trim()}`,
      {
        priorStatus,
        newStatus: AssetStatus.SOLD,
        priorEstimatedValue: priorEstimatedValue.toJSON(),
        saleAmount: saleAmount.toJSON(),
        reason: reason.trim(),
      },
    );

    this.addDomainEvent(
      new AssetSoldDomainEvent(
        this.id.value,
        this._version,
        {
          assetTag: this._assetTag,
          saleAmount: saleAmount.amount,
          saleCurrency: saleAmount.currency,
          reason: reason.trim(),
          actorId,
        },
        this._updatedAt,
      ),
    );
  }

  // ==========================================
  // PRIVATE HELPER & INVARIANT ENFORCEMENT
  // ==========================================

  private assertNotSold(action: string): void {
    if (isTerminalAssetStatus(this._status)) {
      throw new InvalidAssetStateException(
        `Cannot ${action} fixed asset '${this._assetTag}' in terminal state 'SOLD'.`,
      );
    }
  }

  private assertNotRetired(action: string): void {
    if (this._status === AssetStatus.RETIRED) {
      throw new InvalidAssetStateException(
        `Cannot ${action} decommissioned fixed asset '${this._assetTag}' in state 'RETIRED'.`,
      );
    }
  }

  private assertActor(actorId: string): void {
    if (!actorId || actorId.trim().length === 0) {
      throw new InvalidAssetStateException(
        'Authenticated actor ID is mandatory for asset mutations.',
      );
    }
  }

  private appendHistoryAndTouch(
    actorId: string,
    eventType: AssetHistoryEventType,
    description: string,
    details?: Record<string, unknown>,
  ): void {
    const now = new Date();
    this._version += 1;
    this._updatedAt = now;

    const historyEntry = AssetHistoryEvent.create({
      assetId: this.id,
      eventType,
      description,
      details,
      recordedByUserId: actorId,
      recordedAt: now,
    });

    this._historyEvents.push(historyEntry);
  }

  private static validateAssetTag(tag: string): string {
    if (!tag || typeof tag !== 'string' || !TAG_REGEX.test(tag.trim())) {
      throw new InvalidAssetStateException(
        `Invalid asset tag '${tag}'. Must be alphanumeric 3-32 characters (e.g. AST-GYM-001).`,
      );
    }
    return tag.trim().toUpperCase();
  }

  private static validateName(name: string): string {
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120) {
      throw new InvalidAssetStateException(
        `Asset name must be between 2 and 120 characters, got: '${name}'.`,
      );
    }
    return name.trim();
  }

  private static validateCategory(category: AssetCategory): AssetCategory {
    if (!isAssetCategory(category)) {
      throw new InvalidAssetStateException(`Invalid asset category: '${category}'.`);
    }
    return category;
  }

  private static validateStatus(status: AssetStatus): AssetStatus {
    if (!isAssetStatus(status)) {
      throw new InvalidAssetStateException(`Invalid asset status: '${status}'.`);
    }
    return status;
  }

  private static validateCondition(condition: AssetCondition): AssetCondition {
    if (!isAssetCondition(condition)) {
      throw new InvalidAssetStateException(`Invalid asset condition: '${condition}'.`);
    }
    return condition;
  }

  private static validatePurchaseDate(date: Date): Date {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      throw new InvalidAssetStateException('Purchase date must be a valid Date object.');
    }
    return new Date(date.getTime());
  }
}
