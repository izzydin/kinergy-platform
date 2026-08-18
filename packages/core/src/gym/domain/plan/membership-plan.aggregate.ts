import { AggregateRoot } from '../shared/aggregate-root';
import { DomainEvent } from '../shared/domain-event';
import { PlanId } from './plan-id.vo';
import { PlanCode } from './plan-code.vo';
import { PlanDuration } from './plan-duration.vo';
import { PlanPrice } from './plan-price.vo';
import { VisitQuota } from './visit-quota.vo';
import { PlanStatus } from './plan-status.enum';
import { InvalidPlanTransitionException } from '../exceptions/invalid-plan-transition.exception';
import { MembershipPlanInvariantViolationException } from '../exceptions/membership-plan-invariant-violation.exception';
import {
  MembershipPlanCreatedEvent,
  MembershipPlanPublishedEvent,
  MembershipPlanPriceChangedEvent,
  MembershipPlanArchivedEvent,
} from '../events';

export interface CreateMembershipPlanProps {
  id?: PlanId;
  code: PlanCode | string;
  name: string;
  description?: string;
  duration: PlanDuration | number;
  price: PlanPrice | { amount: number; currency?: string };
  visitQuota?: VisitQuota | number;
  status?: PlanStatus;
  createdAt?: Date;
}

export interface ReconstituteMembershipPlanProps {
  id: PlanId | string;
  code: PlanCode | string;
  name: string;
  description?: string;
  duration: PlanDuration | number;
  price: PlanPrice | { amount: number; currency: string };
  visitQuota?: VisitQuota | number | null;
  status: PlanStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * MembershipPlan Aggregate Root.
 * Governs commercial fitness offerings, catalog publishing, pricing, duration, and quotas.
 */
export class MembershipPlan implements AggregateRoot<PlanId> {
  private readonly _id: PlanId;
  private readonly _code: PlanCode;
  private _name: string;
  private _description?: string;
  private _duration: PlanDuration;
  private _price: PlanPrice;
  private _visitQuota?: VisitQuota;
  private _status: PlanStatus;
  private _version: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _uncommittedEvents: DomainEvent[] = [];

  private constructor(
    id: PlanId,
    code: PlanCode,
    name: string,
    description: string | undefined,
    duration: PlanDuration,
    price: PlanPrice,
    visitQuota: VisitQuota | undefined,
    status: PlanStatus,
    version: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this._id = id;
    this._code = code;
    this._name = this.validateAndNormalizeName(name);
    this._description = this.validateAndNormalizeDescription(description);
    this._duration = duration;
    this._price = price;
    this._visitQuota = visitQuota;
    this._status = status;
    this._version = version;
    this._createdAt = new Date(createdAt.getTime());
    this._updatedAt = new Date(updatedAt.getTime());
  }

  // --- Factory Methods ---

  public static create(props: CreateMembershipPlanProps, atDate = new Date()): MembershipPlan {
    const id = props.id ?? PlanId.create();
    const code = props.code instanceof PlanCode ? props.code : PlanCode.create(props.code);
    const duration =
      props.duration instanceof PlanDuration ? props.duration : PlanDuration.ofDays(props.duration);
    const price =
      props.price instanceof PlanPrice
        ? props.price
        : PlanPrice.create(props.price.amount, props.price.currency);
    const visitQuota =
      props.visitQuota !== undefined
        ? props.visitQuota instanceof VisitQuota
          ? props.visitQuota
          : VisitQuota.of(props.visitQuota)
        : undefined;
    const status = props.status ?? PlanStatus.DRAFT;
    const createdAt = props.createdAt
      ? new Date(props.createdAt.getTime())
      : new Date(atDate.getTime());

    const plan = new MembershipPlan(
      id,
      code,
      props.name,
      props.description,
      duration,
      price,
      visitQuota,
      status,
      1,
      createdAt,
      new Date(atDate.getTime()),
    );

    plan.recordEvent(
      new MembershipPlanCreatedEvent(
        id.value,
        code.value,
        plan.name,
        duration.durationInDays,
        price.amount,
        price.currency,
        status,
        visitQuota?.maxVisits,
        1,
        createdAt,
      ),
    );

    return plan;
  }

  public static reconstitute(props: ReconstituteMembershipPlanProps): MembershipPlan {
    const id = props.id instanceof PlanId ? props.id : PlanId.create(props.id);
    const code = props.code instanceof PlanCode ? props.code : PlanCode.create(props.code);
    const duration =
      props.duration instanceof PlanDuration ? props.duration : PlanDuration.ofDays(props.duration);
    const price =
      props.price instanceof PlanPrice
        ? props.price
        : PlanPrice.create(props.price.amount, props.price.currency);
    const visitQuota =
      props.visitQuota !== undefined && props.visitQuota !== null
        ? props.visitQuota instanceof VisitQuota
          ? props.visitQuota
          : VisitQuota.of(props.visitQuota)
        : undefined;

    return new MembershipPlan(
      id,
      code,
      props.name,
      props.description,
      duration,
      price,
      visitQuota,
      props.status,
      props.version,
      props.createdAt,
      props.updatedAt,
    );
  }

  // --- Getters ---

  public get id(): PlanId {
    return this._id;
  }

  public get code(): PlanCode {
    return this._code;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | undefined {
    return this._description;
  }

  public get duration(): PlanDuration {
    return this._duration;
  }

  public get price(): PlanPrice {
    return this._price;
  }

  public get visitQuota(): VisitQuota | undefined {
    return this._visitQuota;
  }

  public get status(): PlanStatus {
    return this._status;
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

  public isAvailableForPurchase(): boolean {
    return this._status === PlanStatus.ACTIVE;
  }

  public getUncommittedEvents(): ReadonlyArray<DomainEvent> {
    return Object.freeze([...this._uncommittedEvents]);
  }

  public clearEvents(): void {
    this._uncommittedEvents = [];
  }

  protected recordEvent(event: DomainEvent): void {
    this._uncommittedEvents.push(event);
  }

  // --- Domain Operations ---

  /**
   * Publishes a draft plan to the commercial catalog, making it available for purchase.
   */
  public publish(atDate = new Date()): void {
    if (this._status === PlanStatus.ACTIVE) {
      return; // Idempotent publish
    }
    if (this._status === PlanStatus.ARCHIVED) {
      throw new InvalidPlanTransitionException(
        this._status,
        PlanStatus.ACTIVE,
        'Cannot publish an archived plan.',
      );
    }

    this._status = PlanStatus.ACTIVE;
    this._version++;
    this._updatedAt = new Date(atDate.getTime());

    this.recordEvent(
      new MembershipPlanPublishedEvent(
        this._id.value,
        this._code.value,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Archives a plan, removing it from active sale while preserving historical agreements.
   */
  public archive(atDate = new Date()): void {
    if (this._status === PlanStatus.ARCHIVED) {
      return; // Idempotent archive
    }

    this._status = PlanStatus.ARCHIVED;
    this._version++;
    this._updatedAt = new Date(atDate.getTime());

    this.recordEvent(
      new MembershipPlanArchivedEvent(
        this._id.value,
        this._code.value,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Updates commercial pricing for subsequent membership purchases.
   */
  public updatePricing(newPrice: PlanPrice, atDate = new Date()): void {
    if (this._status === PlanStatus.ARCHIVED) {
      throw new MembershipPlanInvariantViolationException(
        'Cannot update pricing on an archived plan.',
      );
    }
    if (!newPrice || !(newPrice instanceof PlanPrice)) {
      throw new MembershipPlanInvariantViolationException('Valid PlanPrice must be provided.');
    }

    if (this._price.equals(newPrice)) {
      return;
    }

    const previousPrice = this._price;
    this._price = newPrice;
    this._version++;
    this._updatedAt = new Date(atDate.getTime());

    this.recordEvent(
      new MembershipPlanPriceChangedEvent(
        this._id.value,
        previousPrice.amount,
        previousPrice.currency,
        newPrice.amount,
        newPrice.currency,
        this._version,
        this._updatedAt,
      ),
    );
  }

  /**
   * Updates display details (name and optional description).
   */
  public updateDetails(props: { name?: string; description?: string }, atDate = new Date()): void {
    if (this._status === PlanStatus.ARCHIVED) {
      throw new MembershipPlanInvariantViolationException(
        'Cannot update details on an archived plan.',
      );
    }

    let modified = false;

    if (props.name !== undefined) {
      const validName = this.validateAndNormalizeName(props.name);
      if (this._name !== validName) {
        this._name = validName;
        modified = true;
      }
    }

    if (props.description !== undefined) {
      const validDesc = this.validateAndNormalizeDescription(props.description);
      if (this._description !== validDesc) {
        this._description = validDesc;
        modified = true;
      }
    }

    if (modified) {
      this._version++;
      this._updatedAt = new Date(atDate.getTime());
    }
  }

  /**
   * Updates visit quota.
   */
  public updateVisitQuota(quota: VisitQuota | undefined | null, atDate = new Date()): void {
    if (this._status === PlanStatus.ARCHIVED) {
      throw new MembershipPlanInvariantViolationException(
        'Cannot update visit quota on an archived plan.',
      );
    }

    const normalizedQuota = quota === null ? undefined : quota;
    const isSame =
      (this._visitQuota === undefined && normalizedQuota === undefined) ||
      (this._visitQuota !== undefined &&
        normalizedQuota !== undefined &&
        this._visitQuota.equals(normalizedQuota));

    if (isSame) {
      return;
    }

    this._visitQuota = normalizedQuota;
    this._version++;
    this._updatedAt = new Date(atDate.getTime());
  }

  /**
   * Updates duration. Only permitted when plan is in DRAFT state.
   */
  public updateDuration(newDuration: PlanDuration, atDate = new Date()): void {
    if (this._status !== PlanStatus.DRAFT) {
      throw new MembershipPlanInvariantViolationException(
        `Cannot change duration on a plan in status '${this._status}'. Duration is immutable once published.`,
      );
    }
    if (!newDuration || !(newDuration instanceof PlanDuration)) {
      throw new MembershipPlanInvariantViolationException('Valid PlanDuration must be provided.');
    }

    if (this._duration.equals(newDuration)) {
      return;
    }

    this._duration = newDuration;
    this._version++;
    this._updatedAt = new Date(atDate.getTime());
  }

  // --- Validation Helpers ---

  private validateAndNormalizeName(name: string): string {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new MembershipPlanInvariantViolationException('Plan name cannot be empty.');
    }
    const trimmed = name.trim();
    if (trimmed.length > 100) {
      throw new MembershipPlanInvariantViolationException(
        `Plan name exceeds maximum length of 100 characters (length: ${trimmed.length}).`,
      );
    }
    return trimmed;
  }

  private validateAndNormalizeDescription(description?: string): string | undefined {
    if (description === undefined || description === null) {
      return undefined;
    }
    const trimmed = description.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    if (trimmed.length > 500) {
      throw new MembershipPlanInvariantViolationException(
        `Plan description exceeds maximum length of 500 characters (length: ${trimmed.length}).`,
      );
    }
    return trimmed;
  }
}
