import { AssetStatus } from '../enums/asset-status.enum';
import { InvalidAssetStateException } from '../exceptions/invalid-asset-state.exception';

/**
 * Transition specification representing an edge in the Fixed Asset finite state machine.
 */
export interface StateTransitionRule {
  readonly from: AssetStatus;
  readonly to: AssetStatus;
  readonly action: string;
  readonly allowed: boolean;
  readonly sideEffects: string;
}

/**
 * Deterministic Lifecycle State Machine governing Fixed Asset operational stages.
 * Enforces valid initial states, allowed transition paths, terminal state immutability,
 * and status transition integrity.
 */
export class AssetLifecycleStateMachine {
  /**
   * Set of statuses permitted at initial asset creation/registration.
   */
  public static readonly VALID_INITIAL_STATUSES: ReadonlySet<AssetStatus> = new Set<AssetStatus>([
    AssetStatus.ACTIVE,
    AssetStatus.UNDER_MAINTENANCE,
    AssetStatus.DAMAGED,
  ]);

  /**
   * Complete transition adjacency map.
   */
  private static readonly TRANSITION_GRAPH: Record<AssetStatus, ReadonlySet<AssetStatus>> = {
    [AssetStatus.ACTIVE]: new Set<AssetStatus>([
      AssetStatus.UNDER_MAINTENANCE,
      AssetStatus.DAMAGED,
      AssetStatus.RETIRED,
      AssetStatus.SOLD,
    ]),
    [AssetStatus.UNDER_MAINTENANCE]: new Set<AssetStatus>([
      AssetStatus.ACTIVE,
      AssetStatus.DAMAGED,
      AssetStatus.RETIRED,
      AssetStatus.SOLD,
    ]),
    [AssetStatus.DAMAGED]: new Set<AssetStatus>([
      AssetStatus.UNDER_MAINTENANCE,
      AssetStatus.ACTIVE,
      AssetStatus.RETIRED,
      AssetStatus.SOLD,
    ]),
    [AssetStatus.RETIRED]: new Set<AssetStatus>([
      AssetStatus.SOLD, // Liquidating decommissioned scrap/salvage property
    ]),
    [AssetStatus.SOLD]: new Set<AssetStatus>([
      // Absolute terminal state — no transitions allowed
    ]),
  };

  /**
   * Transition matrix metadata detailing side effects and business rationale.
   */
  public static readonly TRANSITION_MATRIX: readonly StateTransitionRule[] = [
    // Initial states
    {
      from: AssetStatus.ACTIVE,
      to: AssetStatus.UNDER_MAINTENANCE,
      action: 'sendToMaintenance / changeStatus',
      allowed: true,
      sideEffects: 'Asset taken offline; emits AssetStatusChangedDomainEvent; records history',
    },
    {
      from: AssetStatus.ACTIVE,
      to: AssetStatus.DAMAGED,
      action: 'markAsDamaged / changeStatus',
      allowed: true,
      sideEffects: 'Prohibits operational scheduling; records breakdown reason and history',
    },
    {
      from: AssetStatus.ACTIVE,
      to: AssetStatus.RETIRED,
      action: 'retire',
      allowed: true,
      sideEffects: 'Halts depreciation; locks location transfers; emits AssetRetiredDomainEvent',
    },
    {
      from: AssetStatus.ACTIVE,
      to: AssetStatus.SOLD,
      action: 'sell',
      allowed: true,
      sideEffects:
        'Sets terminal lock [AST-INV-1]; fixes realization value; emits AssetSoldDomainEvent',
    },
    // From UNDER_MAINTENANCE
    {
      from: AssetStatus.UNDER_MAINTENANCE,
      to: AssetStatus.ACTIVE,
      action: 'restoreToActive / recordMaintenance',
      allowed: true,
      sideEffects: 'Verifies serviceable condition; restores operational availability',
    },
    {
      from: AssetStatus.UNDER_MAINTENANCE,
      to: AssetStatus.DAMAGED,
      action: 'markAsDamaged / changeStatus',
      allowed: true,
      sideEffects: 'Records repair diagnostic failure or newly discovered structural damage',
    },
    {
      from: AssetStatus.UNDER_MAINTENANCE,
      to: AssetStatus.RETIRED,
      action: 'retire',
      allowed: true,
      sideEffects: 'Beyond economic repair (BER) write-off; locks future servicing',
    },
    {
      from: AssetStatus.UNDER_MAINTENANCE,
      to: AssetStatus.SOLD,
      action: 'sell',
      allowed: true,
      sideEffects: 'Sold as-is for parts/salvage; sets terminal lock [AST-INV-1]',
    },
    // From DAMAGED
    {
      from: AssetStatus.DAMAGED,
      to: AssetStatus.UNDER_MAINTENANCE,
      action: 'sendToMaintenance / changeStatus',
      allowed: true,
      sideEffects: 'Dispatches asset to workshop or field technician for repairs',
    },
    {
      from: AssetStatus.DAMAGED,
      to: AssetStatus.ACTIVE,
      action: 'restoreToActive / recordMaintenance',
      allowed: true,
      sideEffects: 'Validates non-OUT_OF_SERVICE condition; restores operational status',
    },
    {
      from: AssetStatus.DAMAGED,
      to: AssetStatus.RETIRED,
      action: 'retire',
      allowed: true,
      sideEffects: 'Total loss write-off; permanently decommissions asset',
    },
    {
      from: AssetStatus.DAMAGED,
      to: AssetStatus.SOLD,
      action: 'sell',
      allowed: true,
      sideEffects: 'Liquidates damaged asset for scrap value; sets terminal lock',
    },
    // From RETIRED
    {
      from: AssetStatus.RETIRED,
      to: AssetStatus.SOLD,
      action: 'sell',
      allowed: true,
      sideEffects: 'Realizes salvage liquidation proceeds; sets terminal lock [AST-INV-1]',
    },
    {
      from: AssetStatus.RETIRED,
      to: AssetStatus.ACTIVE,
      action: 'recommission (prohibited)',
      allowed: false,
      sideEffects:
        'Prohibited by accounting standards. Re-commissioning requires new Asset registration',
    },
    {
      from: AssetStatus.RETIRED,
      to: AssetStatus.UNDER_MAINTENANCE,
      action: 'service retired asset (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Decommissioned assets cannot incur maintenance expenses',
    },
    {
      from: AssetStatus.RETIRED,
      to: AssetStatus.DAMAGED,
      action: 'mark retired asset damaged (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Decommissioned assets are out of operational tracking',
    },
    // From SOLD (Terminal)
    {
      from: AssetStatus.SOLD,
      to: AssetStatus.ACTIVE,
      action: 'reactivate sold asset (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Ownership transferred outside company boundary',
    },
    {
      from: AssetStatus.SOLD,
      to: AssetStatus.RETIRED,
      action: 'retire sold asset (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Sold asset cannot be retired internally',
    },
    {
      from: AssetStatus.SOLD,
      to: AssetStatus.UNDER_MAINTENANCE,
      action: 'service sold asset (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Sold assets cannot be serviced',
    },
    {
      from: AssetStatus.SOLD,
      to: AssetStatus.DAMAGED,
      action: 'damage sold asset (prohibited)',
      allowed: false,
      sideEffects: 'Prohibited. Sold assets cannot be modified',
    },
  ];

  /**
   * Validate whether a status is permitted during initial aggregate construction.
   */
  public static assertValidInitialStatus(status: AssetStatus): void {
    if (!this.VALID_INITIAL_STATUSES.has(status)) {
      throw new InvalidAssetStateException(
        `Invalid initial asset status '${status}'. Initial status must be one of: ${Array.from(
          this.VALID_INITIAL_STATUSES,
        ).join(', ')}. Creating assets directly as RETIRED or SOLD is prohibited.`,
      );
    }
  }

  /**
   * Evaluate whether a transition is allowed from source to destination.
   */
  public static canTransition(from: AssetStatus, to: AssetStatus): boolean {
    if (from === to) {
      return false; // Self-transitions are invalid
    }
    const allowedTargets = this.TRANSITION_GRAPH[from];
    return allowedTargets ? allowedTargets.has(to) : false;
  }

  /**
   * Return the list of allowed destination statuses from the given source status.
   */
  public static getAllowedTransitions(from: AssetStatus): AssetStatus[] {
    const targets = this.TRANSITION_GRAPH[from];
    return targets ? Array.from(targets) : [];
  }

  /**
   * Assert that a transition from source to destination is valid.
   * Throws InvalidAssetStateException with detailed domain diagnostic rationale if rejected.
   */
  public static assertTransitionValid(from: AssetStatus, to: AssetStatus): void {
    if (from === to) {
      throw new InvalidAssetStateException(
        `Invalid status transition: Asset is already in '${from}' status. Repeated identical transitions are prohibited.`,
      );
    }

    if (from === AssetStatus.SOLD) {
      throw new InvalidAssetStateException(
        `Invalid status transition: Asset has been permanently SOLD and is in an irreversible terminal state. Cannot transition from 'SOLD' to '${to}'. [AST-INV-1]`,
      );
    }

    if (from === AssetStatus.RETIRED && to !== AssetStatus.SOLD) {
      throw new InvalidAssetStateException(
        `Invalid status transition: Asset is RETIRED and cannot transition back to '${to}'. Decommissioned assets can only be liquidated via sale (SOLD).`,
      );
    }

    if (!this.canTransition(from, to)) {
      const allowed = this.getAllowedTransitions(from);
      throw new InvalidAssetStateException(
        `Illegal status transition from '${from}' to '${to}'. Allowed transitions from '${from}': [${allowed.join(
          ', ',
        )}].`,
      );
    }
  }
}
