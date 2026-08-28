import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { InventoryItemId } from './value-objects/inventory-item-id.vo';
import { SKU } from './value-objects/sku.vo';
import { Quantity } from './value-objects/quantity.vo';
import { Money } from './value-objects/money.vo';
import { LocationRef, LocationRefProps } from './value-objects/location-ref.vo';
import { InventoryCategory, isValidInventoryCategory } from './enums/inventory-category.enum';
import { UnitOfMeasure, isValidUnitOfMeasure } from './enums/unit-of-measure.enum';
import { InventoryItemStatus } from './enums/inventory-item-status.enum';
import { StockMovementType } from './enums/stock-movement-type.enum';
import { StockMovement } from './entities/stock-movement.entity';
import { InsufficientStockException } from './exceptions/insufficient-stock.exception';
import { InvalidInventoryItemStateException } from './exceptions/invalid-inventory-item-state.exception';
import {
  InventoryItemCreatedEvent,
  StockReceivedDomainEvent,
  StockConsumedDomainEvent,
  StockSoldDomainEvent,
  StockAdjustedDomainEvent,
  StockCorrectedDomainEvent,
  StockScrappedDomainEvent,
  LowStockThresholdReachedDomainEvent,
  InventoryItemStatusChangedEvent,
} from './events';

export interface CreateInventoryItemProps {
  id?: InventoryItemId | string;
  tenantId?: string;
  sku: SKU | string;
  name: string;
  description?: string;
  category?: InventoryCategory;
  unit?: UnitOfMeasure;
  minimumStock?: Quantity | number;
  initialStock?: Quantity | number;
  purchaseCost?: Money | { amount: number; currency?: string };
  sellingPrice?: Money | { amount: number; currency?: string };
  status?: InventoryItemStatus;
  locationRef?: LocationRef | LocationRefProps;
  recordedByUserId: string;
  createdAt?: Date;
}

export interface ReconstituteInventoryItemProps {
  id: InventoryItemId | string;
  tenantId?: string | null;
  sku: SKU | string;
  name: string;
  description?: string | null;
  category: InventoryCategory;
  unit: UnitOfMeasure;
  minimumStock: Quantity | number;
  quantityOnHand: Quantity | number;
  purchaseCost: Money | { amount: number; currency: string };
  sellingPrice: Money | { amount: number; currency: string };
  status: InventoryItemStatus;
  locationRef?: LocationRef | LocationRefProps | null;
  movements?: StockMovement[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMutationParams {
  quantity: Quantity | number;
  unitCost?: Money | { amount: number; currency?: string };
  actorId: string;
  referenceId?: string;
  reason: string;
}

export interface CorrectStockParams {
  targetCount: Quantity | number;
  actorId: string;
  reason: string;
}

/**
 * InventoryItem Aggregate Root.
 * Governs consumable physical stock, catalog taxonomy, real-time balances, and immutable movements.
 */
export class InventoryItem implements AggregateRoot<InventoryItemId> {
  private readonly _id: InventoryItemId;
  private readonly _tenantId?: string;
  private readonly _sku: SKU;
  private _name: string;
  private _description?: string;
  private _category: InventoryCategory;
  private _unit: UnitOfMeasure;
  private _minimumStock: Quantity;
  private _quantityOnHand: Quantity;
  private _purchaseCost: Money;
  private _sellingPrice: Money;
  private _status: InventoryItemStatus;
  private _locationRef?: LocationRef;
  private _movements: StockMovement[] = [];
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(
    id: InventoryItemId,
    sku: SKU,
    name: string,
    category: InventoryCategory,
    unit: UnitOfMeasure,
    minimumStock: Quantity,
    quantityOnHand: Quantity,
    purchaseCost: Money,
    sellingPrice: Money,
    status: InventoryItemStatus,
    version: number,
    createdAt: Date,
    updatedAt: Date,
    tenantId?: string,
    description?: string,
    locationRef?: LocationRef,
    movements?: StockMovement[],
  ) {
    this._id = id;
    this._sku = sku;
    this._tenantId = tenantId;
    this._name = this.validateName(name);
    this._description = description?.trim() || undefined;
    this._category = category;
    this._unit = unit;
    this._minimumStock = minimumStock;
    this._quantityOnHand = quantityOnHand;
    this._purchaseCost = purchaseCost;
    this._sellingPrice = sellingPrice;
    this._status = status;
    this._version = version;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._locationRef = locationRef;
    if (movements && movements.length > 0) {
      this._movements = [...movements];
    }
  }

  public static create(props: CreateInventoryItemProps): InventoryItem {
    const id =
      props.id instanceof InventoryItemId
        ? props.id
        : InventoryItemId.create(typeof props.id === 'string' ? props.id : undefined);

    const sku = props.sku instanceof SKU ? props.sku : SKU.create(props.sku);
    const category = InventoryItem.validateCategory(props.category);
    const unit = InventoryItem.validateUnit(props.unit);

    const minimumStock =
      props.minimumStock instanceof Quantity
        ? props.minimumStock
        : Quantity.of(props.minimumStock ?? 0);

    const initialStock =
      props.initialStock instanceof Quantity
        ? props.initialStock
        : Quantity.of(props.initialStock ?? 0);

    const purchaseCost =
      props.purchaseCost instanceof Money
        ? props.purchaseCost
        : props.purchaseCost
          ? Money.create(props.purchaseCost.amount, props.purchaseCost.currency)
          : Money.zero();

    const sellingPrice =
      props.sellingPrice instanceof Money
        ? props.sellingPrice
        : props.sellingPrice
          ? Money.create(props.sellingPrice.amount, props.sellingPrice.currency)
          : Money.zero();

    const status = props.status ?? InventoryItemStatus.ACTIVE;
    const locationRef =
      props.locationRef instanceof LocationRef
        ? props.locationRef
        : props.locationRef
          ? LocationRef.create(props.locationRef)
          : undefined;

    const now = props.createdAt ?? new Date();

    if (!props.recordedByUserId || props.recordedByUserId.trim().length === 0) {
      throw new InvalidInventoryItemStateException(
        'Recorded by user ID is required when creating an inventory item.',
      );
    }

    const item = new InventoryItem(
      id,
      sku,
      props.name,
      category,
      unit,
      minimumStock,
      initialStock,
      purchaseCost,
      sellingPrice,
      status,
      1,
      now,
      now,
      props.tenantId?.trim() || undefined,
      props.description,
      locationRef,
      [],
    );

    // If initial stock > 0, generate opening balance movement
    if (initialStock.isPositive()) {
      const openingMovement = StockMovement.create({
        inventoryItemId: id,
        movementType: StockMovementType.ADJUSTMENT_IN,
        quantityDelta: initialStock,
        balanceAfter: initialStock,
        unitCost: purchaseCost,
        reason: 'Initial opening stock balance upon catalog creation',
        recordedByUserId: props.recordedByUserId,
        recordedAt: now,
      });
      item._movements.push(openingMovement);
    }

    item.addDomainEvent(
      new InventoryItemCreatedEvent(
        id.getValue(),
        item.version,
        {
          sku: sku.value,
          name: item.name,
          category,
          unit,
          minimumStock: minimumStock.value,
          initialStock: initialStock.value,
          purchaseCostAmount: purchaseCost.amount,
          purchaseCostCurrency: purchaseCost.currency,
          sellingPriceAmount: sellingPrice.amount,
          sellingPriceCurrency: sellingPrice.currency,
          recordedByUserId: props.recordedByUserId,
        },
        now,
      ),
    );

    return item;
  }

  public static reconstitute(props: ReconstituteInventoryItemProps): InventoryItem {
    const id =
      props.id instanceof InventoryItemId
        ? props.id
        : InventoryItemId.create(typeof props.id === 'string' ? props.id : undefined);

    const sku = props.sku instanceof SKU ? props.sku : SKU.create(props.sku);

    const minimumStock =
      props.minimumStock instanceof Quantity ? props.minimumStock : Quantity.of(props.minimumStock);

    const quantityOnHand =
      props.quantityOnHand instanceof Quantity
        ? props.quantityOnHand
        : Quantity.of(props.quantityOnHand);

    const purchaseCost =
      props.purchaseCost instanceof Money
        ? props.purchaseCost
        : Money.create(props.purchaseCost.amount, props.purchaseCost.currency);

    const sellingPrice =
      props.sellingPrice instanceof Money
        ? props.sellingPrice
        : Money.create(props.sellingPrice.amount, props.sellingPrice.currency);

    const locationRef =
      props.locationRef instanceof LocationRef
        ? props.locationRef
        : props.locationRef
          ? LocationRef.create(props.locationRef)
          : undefined;

    return new InventoryItem(
      id,
      sku,
      props.name,
      InventoryItem.validateCategory(props.category),
      props.unit,
      minimumStock,
      quantityOnHand,
      purchaseCost,
      sellingPrice,
      props.status,
      props.version,
      props.createdAt,
      props.updatedAt,
      props.tenantId ?? undefined,
      props.description ?? undefined,
      locationRef,
      props.movements ?? [],
    );
  }

  // ============================================================================
  // DOMAIN MUTATIONS & INVARIANT ENFORCEMENT
  // ============================================================================

  /**
   * Receives incoming stock from a supplier or purchase order.
   * Operation: PURCHASE. Increases stock by quantity delta.
   */
  public receiveStock(params: StockMutationParams): StockMovement {
    this.assertActiveCatalogStatus('receive stock');
    const delta = this.parsePositiveQuantity(params.quantity, 'receive');
    const unitCost = params.unitCost
      ? params.unitCost instanceof Money
        ? params.unitCost
        : Money.create(params.unitCost.amount, params.unitCost.currency)
      : this._purchaseCost;

    const newBalance = this._quantityOnHand.add(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.PURCHASE,
      quantityDelta: delta,
      balanceAfter: newBalance,
      unitCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      referenceId: params.referenceId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockReceivedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          quantityDelta: delta.value,
          balanceAfter: newBalance.value,
          unitCostAmount: unitCost.amount,
          unitCostCurrency: unitCost.currency,
          reason: params.reason,
          recordedByUserId: params.actorId,
          referenceId: params.referenceId,
        },
        now,
      ),
    );

    return movement;
  }

  /**
   * Consumes consumable supplies during a clinical therapy session or internal operational use.
   * Operation: CONSUMPTION. Decreases stock by quantity delta.
   */
  public consumeStock(params: StockMutationParams): StockMovement {
    this.assertActiveCatalogStatus('consume stock');
    const delta = this.parsePositiveQuantity(params.quantity, 'consume');
    this.assertSufficientStock(delta);

    const newBalance = this._quantityOnHand.subtract(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.CONSUMPTION,
      quantityDelta: Quantity.ofDelta(-delta.value),
      balanceAfter: newBalance,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      referenceId: params.referenceId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockConsumedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          quantityDelta: -delta.value,
          balanceAfter: newBalance.value,
          reason: params.reason,
          recordedByUserId: params.actorId,
          referenceId: params.referenceId,
        },
        now,
      ),
    );

    this.checkAndRaiseLowStockAlert();
    return movement;
  }

  /**
   * Sells consumable goods at retail/checkout to a client or patient.
   * Operation: SALE. Decreases stock by quantity delta.
   */
  public sellStock(params: StockMutationParams): StockMovement {
    this.assertActiveCatalogStatus('sell stock');
    const delta = this.parsePositiveQuantity(params.quantity, 'sell');
    this.assertSufficientStock(delta);

    const newBalance = this._quantityOnHand.subtract(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.SALE,
      quantityDelta: Quantity.ofDelta(-delta.value),
      balanceAfter: newBalance,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      referenceId: params.referenceId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockSoldDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          quantityDelta: -delta.value,
          balanceAfter: newBalance.value,
          sellingPriceAmount: this._sellingPrice.amount,
          sellingPriceCurrency: this._sellingPrice.currency,
          reason: params.reason,
          recordedByUserId: params.actorId,
          referenceId: params.referenceId,
        },
        now,
      ),
    );

    this.checkAndRaiseLowStockAlert();
    return movement;
  }

  /**
   * Positive manual stock adjustment based on inventory physical count or audit found stock.
   * Operation: ADJUSTMENT_IN. Increases stock by quantity delta.
   */
  public adjustStockIn(
    params: Omit<StockMutationParams, 'referenceId' | 'unitCost'>,
  ): StockMovement {
    this.assertActiveCatalogStatus('adjust stock in');
    const delta = this.parsePositiveQuantity(params.quantity, 'adjust in');
    const newBalance = this._quantityOnHand.add(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.ADJUSTMENT_IN,
      quantityDelta: delta,
      balanceAfter: newBalance,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockAdjustedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          movementType: StockMovementType.ADJUSTMENT_IN,
          quantityDelta: delta.value,
          balanceAfter: newBalance.value,
          reason: params.reason,
          recordedByUserId: params.actorId,
        },
        now,
      ),
    );

    return movement;
  }

  /**
   * Negative manual stock adjustment based on inventory physical count or shrinkage.
   * Operation: ADJUSTMENT_OUT. Decreases stock by quantity delta.
   */
  public adjustStockOut(
    params: Omit<StockMutationParams, 'referenceId' | 'unitCost'>,
  ): StockMovement {
    this.assertActiveCatalogStatus('adjust stock out');
    const delta = this.parsePositiveQuantity(params.quantity, 'adjust out');
    this.assertSufficientStock(delta);

    const newBalance = this._quantityOnHand.subtract(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.ADJUSTMENT_OUT,
      quantityDelta: Quantity.ofDelta(-delta.value),
      balanceAfter: newBalance,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockAdjustedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          movementType: StockMovementType.ADJUSTMENT_OUT,
          quantityDelta: -delta.value,
          balanceAfter: newBalance.value,
          reason: params.reason,
          recordedByUserId: params.actorId,
        },
        now,
      ),
    );

    this.checkAndRaiseLowStockAlert();
    return movement;
  }

  /**
   * Sets current stock to an absolute target count (discrepancy resolution).
   * Operation: CORRECTION. Signed delta calculated automatically.
   */
  public correctStock(params: CorrectStockParams): StockMovement {
    this.assertActiveCatalogStatus('correct stock balance');
    const target =
      params.targetCount instanceof Quantity ? params.targetCount : Quantity.of(params.targetCount);

    const previousBalance = this._quantityOnHand;
    const deltaNumber = Math.round((target.value - previousBalance.value) * 100) / 100;
    const delta = Quantity.ofDelta(deltaNumber);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.CORRECTION,
      quantityDelta: delta,
      balanceAfter: target,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      recordedAt: now,
    });

    this._quantityOnHand = target;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockCorrectedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          previousBalance: previousBalance.value,
          newBalance: target.value,
          quantityDelta: deltaNumber,
          reason: params.reason,
          recordedByUserId: params.actorId,
        },
        now,
      ),
    );

    this.checkAndRaiseLowStockAlert();
    return movement;
  }

  /**
   * Scraps damaged, expired, or contaminated inventory.
   * Operation: SCRAP. Decreases stock by quantity delta.
   */
  public scrapStock(params: Omit<StockMutationParams, 'referenceId' | 'unitCost'>): StockMovement {
    this.assertActiveCatalogStatus('scrap stock');
    const delta = this.parsePositiveQuantity(params.quantity, 'scrap');
    this.assertSufficientStock(delta);

    const newBalance = this._quantityOnHand.subtract(delta);
    const now = new Date();

    const movement = StockMovement.create({
      inventoryItemId: this._id,
      movementType: StockMovementType.SCRAP,
      quantityDelta: Quantity.ofDelta(-delta.value),
      balanceAfter: newBalance,
      unitCost: this._purchaseCost,
      reason: params.reason,
      recordedByUserId: params.actorId,
      recordedAt: now,
    });

    this._quantityOnHand = newBalance;
    this._movements.push(movement);
    this._updatedAt = now;
    this.incrementVersion();

    this.addDomainEvent(
      new StockScrappedDomainEvent(
        this._id.getValue(),
        this._version,
        {
          movementId: movement.id.getValue(),
          quantityDelta: -delta.value,
          balanceAfter: newBalance.value,
          reason: params.reason,
          recordedByUserId: params.actorId,
        },
        now,
      ),
    );

    this.checkAndRaiseLowStockAlert();
    return movement;
  }

  /**
   * Updates non-stock catalog metadata.
   */
  public updateCatalogDetails(props: {
    name?: string;
    description?: string;
    category?: InventoryCategory;
    unit?: UnitOfMeasure;
    minimumStock?: Quantity | number;
    purchaseCost?: Money | { amount: number; currency?: string };
    sellingPrice?: Money | { amount: number; currency?: string };
    locationRef?: LocationRef | LocationRefProps | null;
  }): void {
    if (this._status === InventoryItemStatus.ARCHIVED) {
      throw new InvalidInventoryItemStateException(
        'Cannot modify catalog details of an archived inventory item.',
      );
    }

    if (props.name !== undefined) {
      this._name = this.validateName(props.name);
    }
    if (props.description !== undefined) {
      this._description = props.description.trim() || undefined;
    }
    if (props.category !== undefined) {
      this._category = InventoryItem.validateCategory(props.category);
    }
    if (props.unit !== undefined) {
      const validatedUnit = InventoryItem.validateUnit(props.unit);
      if (
        validatedUnit !== this._unit &&
        (this._quantityOnHand.isPositive() || this._movements.length > 0)
      ) {
        throw new InvalidInventoryItemStateException(
          'Cannot change unit of measure for a product with positive stock on hand or existing inventory movements.',
        );
      }
      this._unit = validatedUnit;
    }
    if (props.minimumStock !== undefined) {
      this._minimumStock =
        props.minimumStock instanceof Quantity
          ? props.minimumStock
          : Quantity.of(props.minimumStock);
    }
    if (props.purchaseCost !== undefined) {
      this._purchaseCost =
        props.purchaseCost instanceof Money
          ? props.purchaseCost
          : Money.create(props.purchaseCost.amount, props.purchaseCost.currency);
    }
    if (props.sellingPrice !== undefined) {
      this._sellingPrice =
        props.sellingPrice instanceof Money
          ? props.sellingPrice
          : Money.create(props.sellingPrice.amount, props.sellingPrice.currency);
    }
    if (props.locationRef !== undefined) {
      this._locationRef =
        props.locationRef instanceof LocationRef
          ? props.locationRef
          : props.locationRef
            ? LocationRef.create(props.locationRef)
            : undefined;
    }

    this._updatedAt = new Date();
    this.incrementVersion();
  }

  /**
   * Transitions item to INACTIVE (suspends stock mutations).
   */
  public deactivate(actorId: string, reason?: string): void {
    if (this._status === InventoryItemStatus.ARCHIVED) {
      throw new InvalidInventoryItemStateException('Cannot deactivate an archived inventory item.');
    }
    if (this._status === InventoryItemStatus.INACTIVE) {
      return;
    }

    const previousStatus = this._status;
    this._status = InventoryItemStatus.INACTIVE;
    this._updatedAt = new Date();
    this.incrementVersion();

    this.addDomainEvent(
      new InventoryItemStatusChangedEvent(this._id.getValue(), this._version, {
        previousStatus,
        newStatus: InventoryItemStatus.INACTIVE,
        reason,
        actorId,
      }),
    );
  }

  /**
   * Re-activates an INACTIVE item.
   */
  public activate(actorId: string): void {
    if (this._status === InventoryItemStatus.ARCHIVED) {
      throw new InvalidInventoryItemStateException('Cannot activate an archived inventory item.');
    }
    if (this._status === InventoryItemStatus.ACTIVE) {
      return;
    }

    const previousStatus = this._status;
    this._status = InventoryItemStatus.ACTIVE;
    this._updatedAt = new Date();
    this.incrementVersion();

    this.addDomainEvent(
      new InventoryItemStatusChangedEvent(this._id.getValue(), this._version, {
        previousStatus,
        newStatus: InventoryItemStatus.ACTIVE,
        actorId,
      }),
    );
  }

  /**
   * Permanently archives an item (terminal read-only state).
   * Invariant: Requires zero stock on hand (quantityOnHand == 0.00).
   */
  public archive(actorId: string, reason?: string): void {
    if (this._status === InventoryItemStatus.ARCHIVED) {
      return;
    }
    if (this._quantityOnHand.isPositive()) {
      throw new InvalidInventoryItemStateException(
        'Cannot archive an inventory item with remaining stock on hand. Stock must be zero.',
      );
    }

    const previousStatus = this._status;
    this._status = InventoryItemStatus.ARCHIVED;
    this._updatedAt = new Date();
    this.incrementVersion();

    this.addDomainEvent(
      new InventoryItemStatusChangedEvent(this._id.getValue(), this._version, {
        previousStatus,
        newStatus: InventoryItemStatus.ARCHIVED,
        reason,
        actorId,
      }),
    );
  }

  /**
   * Calculates total valuation of current stock on hand.
   */
  public calculateStockValuation(): Money {
    return this._purchaseCost.multiply(this._quantityOnHand);
  }

  // ============================================================================
  // GETTERS & UTILITIES
  // ============================================================================

  public get id(): InventoryItemId {
    return this._id;
  }

  public get tenantId(): string | undefined {
    return this._tenantId;
  }

  public get sku(): SKU {
    return this._sku;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public get category(): InventoryCategory {
    return this._category;
  }

  public get unit(): UnitOfMeasure {
    return this._unit;
  }

  public get minimumStock(): Quantity {
    return this._minimumStock;
  }

  public get quantityOnHand(): Quantity {
    return this._quantityOnHand;
  }

  public get purchaseCost(): Money {
    return this._purchaseCost;
  }

  public get sellingPrice(): Money {
    return this._sellingPrice;
  }

  public get status(): InventoryItemStatus {
    return this._status;
  }

  public get locationRef(): LocationRef | undefined {
    return this._locationRef;
  }

  public get movements(): ReadonlyArray<StockMovement> {
    return this._movements;
  }

  public get version(): number {
    return this._version;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isLowStock(): boolean {
    return this._quantityOnHand.isLessThanOrEqual(this._minimumStock);
  }

  public isOutOfStock(): boolean {
    return this._quantityOnHand.isZero();
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return this._uncommittedEvents;
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }

  private addDomainEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  private incrementVersion(): void {
    this._version += 1;
  }

  private validateName(name: string): string {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new InvalidInventoryItemStateException('Item name cannot be empty.');
    }
    const trimmed = name.trim();
    if (trimmed.length > 120) {
      throw new InvalidInventoryItemStateException('Item name cannot exceed 120 characters.');
    }
    return trimmed;
  }

  private parsePositiveQuantity(quantity: Quantity | number, operation: string): Quantity {
    const qty = quantity instanceof Quantity ? quantity : Quantity.of(quantity);
    if (!qty.isPositive()) {
      throw new InvalidInventoryItemStateException(
        `Quantity for ${operation} must be greater than zero, got: ${qty.value}. Invariant [INV-3] violated.`,
      );
    }
    return qty;
  }

  private static validateCategory(category: unknown): InventoryCategory {
    if (category === undefined || category === null) {
      return InventoryCategory.CLINICAL_SUPPLIES;
    }
    if (!isValidInventoryCategory(category)) {
      throw new InvalidInventoryItemStateException(
        `Invalid inventory category: '${category}'. Valid categories are: ${Object.values(InventoryCategory).join(', ')}`,
      );
    }
    return category;
  }

  private static validateUnit(unit: unknown): UnitOfMeasure {
    if (unit === undefined || unit === null) {
      return UnitOfMeasure.UNITS;
    }
    if (!isValidUnitOfMeasure(unit)) {
      throw new InvalidInventoryItemStateException(
        `Invalid unit of measure: '${unit}'. Valid units are: ${Object.values(UnitOfMeasure).join(', ')}`,
      );
    }
    return unit;
  }

  private assertActiveCatalogStatus(operation: string): void {
    if (this._status !== InventoryItemStatus.ACTIVE) {
      throw new InvalidInventoryItemStateException(
        `Cannot ${operation} on item '${this._name}' (${this._sku.value}) because its status is ${this._status}. Invariant [INV-5] violated.`,
      );
    }
  }

  private assertSufficientStock(requiredQuantity: Quantity): void {
    if (this._quantityOnHand.isLessThan(requiredQuantity)) {
      throw new InsufficientStockException(
        this._sku.value,
        this._quantityOnHand.value,
        requiredQuantity.value,
      );
    }
  }

  private checkAndRaiseLowStockAlert(): void {
    if (this.isLowStock()) {
      this.addDomainEvent(
        new LowStockThresholdReachedDomainEvent(
          this._id.getValue(),
          this._version,
          {
            sku: this._sku.value,
            itemName: this._name,
            currentStock: this._quantityOnHand.value,
            minimumStock: this._minimumStock.value,
          },
          this._updatedAt,
        ),
      );
    }
  }
}
