import { StockMovementId } from '../value-objects/stock-movement-id.vo';
import { InventoryItemId } from '../value-objects/inventory-item-id.vo';
import { StockMovementType } from '../enums/stock-movement-type.enum';
import { Quantity } from '../value-objects/quantity.vo';
import { Money } from '../value-objects/money.vo';
import { InvalidInventoryItemStateException } from '../exceptions/invalid-inventory-item-state.exception';

export interface CreateStockMovementProps {
  id?: StockMovementId | string;
  inventoryItemId: InventoryItemId | string;
  movementType: StockMovementType;
  quantityDelta: Quantity | number;
  balanceAfter: Quantity | number;
  unitCost?: Money | { amount: number; currency?: string };
  reason: string;
  recordedByUserId: string;
  referenceId?: string;
  recordedAt?: Date;
}

/**
 * Child Entity representing an immutable, append-only inventory movement ledger entry.
 * Invariants [INV-2], [INV-7], [INV-8], [INV-9].
 */
export class StockMovement {
  private readonly _id: StockMovementId;
  private readonly _inventoryItemId: InventoryItemId;
  private readonly _movementType: StockMovementType;
  private readonly _quantityDelta: Quantity;
  private readonly _balanceAfter: Quantity;
  private readonly _unitCost: Money;
  private readonly _reason: string;
  private readonly _recordedByUserId: string;
  private readonly _referenceId?: string;
  private readonly _recordedAt: Date;

  private constructor(props: CreateStockMovementProps) {
    this._id =
      props.id instanceof StockMovementId
        ? props.id
        : StockMovementId.create(typeof props.id === 'string' ? props.id : undefined);

    this._inventoryItemId =
      props.inventoryItemId instanceof InventoryItemId
        ? props.inventoryItemId
        : InventoryItemId.create(props.inventoryItemId);

    if (!props.movementType || !Object.values(StockMovementType).includes(props.movementType)) {
      throw new InvalidInventoryItemStateException(
        `Invalid StockMovementType '${props.movementType}'.`,
      );
    }
    this._movementType = props.movementType;

    this._quantityDelta =
      props.quantityDelta instanceof Quantity
        ? props.quantityDelta
        : Quantity.ofDelta(props.quantityDelta);

    this._balanceAfter =
      props.balanceAfter instanceof Quantity ? props.balanceAfter : Quantity.of(props.balanceAfter);

    if (props.unitCost instanceof Money) {
      this._unitCost = props.unitCost;
    } else if (props.unitCost) {
      this._unitCost = Money.create(props.unitCost.amount, props.unitCost.currency);
    } else {
      this._unitCost = Money.zero();
    }

    if (!props.reason || typeof props.reason !== 'string' || props.reason.trim().length < 3) {
      throw new InvalidInventoryItemStateException(
        'Stock movement reason must be a non-empty string with at least 3 characters.',
      );
    }
    this._reason = props.reason.trim();

    if (
      !props.recordedByUserId ||
      typeof props.recordedByUserId !== 'string' ||
      props.recordedByUserId.trim().length === 0
    ) {
      throw new InvalidInventoryItemStateException(
        'Stock movement must specify a valid recordedByUserId.',
      );
    }
    this._recordedByUserId = props.recordedByUserId.trim();
    this._referenceId = props.referenceId?.trim() || undefined;
    this._recordedAt = props.recordedAt ?? new Date();

    Object.freeze(this);
  }

  public static create(props: CreateStockMovementProps): StockMovement {
    return new StockMovement(props);
  }

  public static reconstitute(props: CreateStockMovementProps): StockMovement {
    return new StockMovement(props);
  }

  public get id(): StockMovementId {
    return this._id;
  }

  public get inventoryItemId(): InventoryItemId {
    return this._inventoryItemId;
  }

  public get movementType(): StockMovementType {
    return this._movementType;
  }

  public get quantityDelta(): Quantity {
    return this._quantityDelta;
  }

  public get balanceAfter(): Quantity {
    return this._balanceAfter;
  }

  public get unitCost(): Money {
    return this._unitCost;
  }

  public get reason(): string {
    return this._reason;
  }

  public get recordedByUserId(): string {
    return this._recordedByUserId;
  }

  public get referenceId(): string | undefined {
    return this._referenceId;
  }

  public get recordedAt(): Date {
    return this._recordedAt;
  }
}
