/**
 * Authoritative business classification for consumable inventory items.
 *
 * Encapsulates the canonical operational and commercial categories across
 * Kinergy wellness, gym, and clinical facilities.
 */
export enum InventoryCategory {
  HEALTHY_MEALS = 'HEALTHY_MEALS',
  HEALTHY_DRINKS = 'HEALTHY_DRINKS',
  CLEANING_SUPPLIES = 'CLEANING_SUPPLIES',
  OFFICE_SUPPLIES = 'OFFICE_SUPPLIES',
  SUPPLEMENTS = 'SUPPLEMENTS',
  CLINICAL_SUPPLIES = 'CLINICAL_SUPPLIES',
  THERAPY_CONSUMABLES = 'THERAPY_CONSUMABLES',
  RETAIL_PRODUCTS = 'RETAIL_PRODUCTS',
}

/**
 * Metadata descriptor for an InventoryCategory.
 */
export interface InventoryCategoryDescriptor {
  readonly code: InventoryCategory;
  readonly displayName: string;
  readonly description: string;
  readonly isPerishable: boolean;
  readonly isRetailEligible: boolean;
}

export const INVENTORY_CATEGORY_REGISTRY: Record<InventoryCategory, InventoryCategoryDescriptor> = {
  [InventoryCategory.HEALTHY_MEALS]: {
    code: InventoryCategory.HEALTHY_MEALS,
    displayName: 'Healthy Meals',
    description: 'Fresh and prepared nutritional meal portions for clients and athletes.',
    isPerishable: true,
    isRetailEligible: true,
  },
  [InventoryCategory.HEALTHY_DRINKS]: {
    code: InventoryCategory.HEALTHY_DRINKS,
    displayName: 'Healthy Drinks',
    description: 'Electrolyte beverages, smoothies, juices, and functional wellness drinks.',
    isPerishable: true,
    isRetailEligible: true,
  },
  [InventoryCategory.CLEANING_SUPPLIES]: {
    code: InventoryCategory.CLEANING_SUPPLIES,
    displayName: 'Cleaning Supplies',
    description: 'Disinfectants, sanitizing wipes, detergents, and facility hygiene materials.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.OFFICE_SUPPLIES]: {
    code: InventoryCategory.OFFICE_SUPPLIES,
    displayName: 'Office Supplies',
    description: 'Administrative consumables, paper goods, printing items, and stationery.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.SUPPLEMENTS]: {
    code: InventoryCategory.SUPPLEMENTS,
    displayName: 'Supplements',
    description: 'Nutritional powders, vitamins, protein bars, and performance supplements.',
    isPerishable: false,
    isRetailEligible: true,
  },
  [InventoryCategory.CLINICAL_SUPPLIES]: {
    code: InventoryCategory.CLINICAL_SUPPLIES,
    displayName: 'Clinical Supplies',
    description: 'Acupuncture needles, ultrasound gel, massage lotions, and exam disposables.',
    isPerishable: false,
    isRetailEligible: false,
  },
  [InventoryCategory.THERAPY_CONSUMABLES]: {
    code: InventoryCategory.THERAPY_CONSUMABLES,
    displayName: 'Therapy Consumables',
    description:
      'Elastic therapeutic tape, resistance bands, exercise putty, and rehab disposables.',
    isPerishable: false,
    isRetailEligible: true,
  },
  [InventoryCategory.RETAIL_PRODUCTS]: {
    code: InventoryCategory.RETAIL_PRODUCTS,
    displayName: 'Retail Products',
    description: 'Commercial merchandise, foam rollers, branded apparel, and gear for sale.',
    isPerishable: false,
    isRetailEligible: true,
  },
};

/**
 * Validates whether a given string is a recognized InventoryCategory enum value.
 */
export function isValidInventoryCategory(value: unknown): value is InventoryCategory {
  return (
    typeof value === 'string' &&
    Object.values(InventoryCategory).includes(value as InventoryCategory)
  );
}

/**
 * Parses and validates an input string into a strongly-typed InventoryCategory.
 * Throws an error if the category is invalid.
 */
export function parseInventoryCategory(value: unknown): InventoryCategory {
  if (isValidInventoryCategory(value)) {
    return value;
  }
  throw new Error(
    `Invalid inventory category: '${value}'. Valid categories are: ${Object.values(InventoryCategory).join(', ')}`,
  );
}
