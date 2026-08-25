/**
 * Authoritative business Unit of Measure (UOM) classification for consumable inventory items.
 *
 * Encapsulates canonical discrete counting metrics and continuous physical/chemical units
 * utilized across Kinergy clinical, gym, and facility operations.
 */
export enum UnitOfMeasure {
  UNITS = 'UNITS',
  BOXES = 'BOXES',
  BOTTLES = 'BOTTLES',
  ROLLS = 'ROLLS',
  MILLILITERS = 'MILLILITERS',
  GRAMS = 'GRAMS',
}

/**
 * Metadata descriptor for a UnitOfMeasure.
 */
export interface UnitOfMeasureDescriptor {
  readonly code: UnitOfMeasure;
  readonly displayName: string;
  readonly description: string;
  readonly isContinuous: boolean;
  readonly standardScale: number;
}

export const UNIT_OF_MEASURE_REGISTRY: Record<UnitOfMeasure, UnitOfMeasureDescriptor> = {
  [UnitOfMeasure.UNITS]: {
    code: UnitOfMeasure.UNITS,
    displayName: 'Units (each)',
    description:
      'Discrete individual items or individual portions (e.g., meal prep containers, resistance bands).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.BOXES]: {
    code: UnitOfMeasure.BOXES,
    displayName: 'Boxes',
    description:
      'Packaged multi-item containers or carton packs (e.g., box of acupuncture needles, box of nitrile gloves).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.BOTTLES]: {
    code: UnitOfMeasure.BOTTLES,
    displayName: 'Bottles',
    description:
      'Individual packaged drink, spray, or massage lotion bottles (e.g., electrolyte drink, disinfectant spray).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.ROLLS]: {
    code: UnitOfMeasure.ROLLS,
    displayName: 'Rolls',
    description:
      'Continuous rolled supplies (e.g., kinesiology tape rolls, examination table paper rolls).',
    isContinuous: false,
    standardScale: 2,
  },
  [UnitOfMeasure.MILLILITERS]: {
    code: UnitOfMeasure.MILLILITERS,
    displayName: 'Milliliters (ml)',
    description:
      'Volumetric liquid or gel measure for clinical and cleaning applications (e.g., ultrasound gel, liquid disinfectant).',
    isContinuous: true,
    standardScale: 2,
  },
  [UnitOfMeasure.GRAMS]: {
    code: UnitOfMeasure.GRAMS,
    displayName: 'Grams (g)',
    description:
      'Mass or weight measure for powders and nutritional supplements (e.g., protein powder, electrolyte blend).',
    isContinuous: true,
    standardScale: 2,
  },
};

/**
 * Validates whether a given string is a recognized UnitOfMeasure enum value.
 */
export function isValidUnitOfMeasure(value: unknown): value is UnitOfMeasure {
  return typeof value === 'string' && Object.values(UnitOfMeasure).includes(value as UnitOfMeasure);
}

/**
 * Parses and validates an input string into a strongly-typed UnitOfMeasure.
 * Throws an error if the unit is invalid.
 */
export function parseUnitOfMeasure(value: unknown): UnitOfMeasure {
  if (isValidUnitOfMeasure(value)) {
    return value;
  }
  throw new Error(
    `Invalid unit of measure: '${value}'. Valid units are: ${Object.values(UnitOfMeasure).join(', ')}`,
  );
}
