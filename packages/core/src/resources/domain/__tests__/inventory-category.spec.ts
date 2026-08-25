import {
  InventoryCategory,
  INVENTORY_CATEGORY_REGISTRY,
  isValidInventoryCategory,
  parseInventoryCategory,
} from '../inventory/enums/inventory-category.enum';
import { InventoryItem } from '../inventory/inventory-item.aggregate';
import { UnitOfMeasure } from '../inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../inventory/enums/inventory-item-status.enum';
import { InvalidInventoryItemStateException } from '../inventory/exceptions/invalid-inventory-item-state.exception';

describe('Phase 6.1: Inventory Category Strategy & Canonical Business Taxonomies (ADR-0088)', () => {
  const actorId = 'usr_ops_lead_123';

  describe('1. Minimum Required Business Categories', () => {
    const requiredCategories: Array<{
      category: InventoryCategory;
      expectedName: string;
      isPerishable: boolean;
      isRetailEligible: boolean;
    }> = [
      {
        category: InventoryCategory.HEALTHY_MEALS,
        expectedName: 'Healthy Meals',
        isPerishable: true,
        isRetailEligible: true,
      },
      {
        category: InventoryCategory.HEALTHY_DRINKS,
        expectedName: 'Healthy Drinks',
        isPerishable: true,
        isRetailEligible: true,
      },
      {
        category: InventoryCategory.CLEANING_SUPPLIES,
        expectedName: 'Cleaning Supplies',
        isPerishable: false,
        isRetailEligible: false,
      },
      {
        category: InventoryCategory.OFFICE_SUPPLIES,
        expectedName: 'Office Supplies',
        isPerishable: false,
        isRetailEligible: false,
      },
      {
        category: InventoryCategory.SUPPLEMENTS,
        expectedName: 'Supplements',
        isPerishable: false,
        isRetailEligible: true,
      },
      {
        category: InventoryCategory.CLINICAL_SUPPLIES,
        expectedName: 'Clinical Supplies',
        isPerishable: false,
        isRetailEligible: false,
      },
      {
        category: InventoryCategory.THERAPY_CONSUMABLES,
        expectedName: 'Therapy Consumables',
        isPerishable: false,
        isRetailEligible: true,
      },
      {
        category: InventoryCategory.RETAIL_PRODUCTS,
        expectedName: 'Retail Products',
        isPerishable: false,
        isRetailEligible: true,
      },
    ];

    it.each(requiredCategories)(
      'registers and provides correct descriptor for category: $category',
      ({ category, expectedName, isPerishable, isRetailEligible }) => {
        expect(isValidInventoryCategory(category)).toBe(true);

        const descriptor = INVENTORY_CATEGORY_REGISTRY[category];
        expect(descriptor).toBeDefined();
        expect(descriptor.code).toBe(category);
        expect(descriptor.displayName).toBe(expectedName);
        expect(descriptor.isPerishable).toBe(isPerishable);
        expect(descriptor.isRetailEligible).toBe(isRetailEligible);
      },
    );
  });

  describe('2. Validation & Parsing Guards', () => {
    it('successfully parses all valid category string values', () => {
      expect(parseInventoryCategory('HEALTHY_MEALS')).toBe(InventoryCategory.HEALTHY_MEALS);
      expect(parseInventoryCategory('HEALTHY_DRINKS')).toBe(InventoryCategory.HEALTHY_DRINKS);
      expect(parseInventoryCategory('CLEANING_SUPPLIES')).toBe(InventoryCategory.CLEANING_SUPPLIES);
      expect(parseInventoryCategory('OFFICE_SUPPLIES')).toBe(InventoryCategory.OFFICE_SUPPLIES);
      expect(parseInventoryCategory('SUPPLEMENTS')).toBe(InventoryCategory.SUPPLEMENTS);
    });

    it('rejects invalid, unknown, or empty category strings', () => {
      expect(isValidInventoryCategory('INVALID_CATEGORY')).toBe(false);
      expect(isValidInventoryCategory('')).toBe(false);
      expect(isValidInventoryCategory(null)).toBe(false);
      expect(isValidInventoryCategory(undefined)).toBe(false);
      expect(isValidInventoryCategory(123)).toBe(false);

      expect(() => parseInventoryCategory('RANDOM_CATEGORY')).toThrow(/Invalid inventory category/);
    });
  });

  describe('3. Product Aggregate Integration with Categories', () => {
    it('creates products across diverse canonical business categories', () => {
      // 1. Healthy Meal
      const meal = InventoryItem.create({
        sku: 'MEAL-KETO-CHICKEN',
        name: 'Keto Grilled Chicken Bowl 400g',
        category: InventoryCategory.HEALTHY_MEALS,
        unit: UnitOfMeasure.UNITS,
        initialStock: 15,
        sellingPrice: { amount: 14.5, currency: 'USD' },
        recordedByUserId: actorId,
      });
      expect(meal.category).toBe(InventoryCategory.HEALTHY_MEALS);
      expect(INVENTORY_CATEGORY_REGISTRY[meal.category].isPerishable).toBe(true);

      // 2. Healthy Drink
      const drink = InventoryItem.create({
        sku: 'DRK-ELECTRO-500',
        name: 'Hydration Electrolyte Drink (Citrus)',
        category: InventoryCategory.HEALTHY_DRINKS,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 48,
        sellingPrice: { amount: 4.0, currency: 'USD' },
        recordedByUserId: actorId,
      });
      expect(drink.category).toBe(InventoryCategory.HEALTHY_DRINKS);
      expect(INVENTORY_CATEGORY_REGISTRY[drink.category].isPerishable).toBe(true);

      // 3. Cleaning Supplies
      const cleaner = InventoryItem.create({
        sku: 'CLN-DISINFECT-5L',
        name: 'Hospital-Grade Disinfectant 5L',
        category: InventoryCategory.CLEANING_SUPPLIES,
        unit: UnitOfMeasure.BOTTLES,
        initialStock: 6,
        recordedByUserId: actorId,
      });
      expect(cleaner.category).toBe(InventoryCategory.CLEANING_SUPPLIES);
      expect(INVENTORY_CATEGORY_REGISTRY[cleaner.category].isRetailEligible).toBe(false);

      // 4. Office Supplies
      const paper = InventoryItem.create({
        sku: 'OFF-PAPER-A4',
        name: 'Recycled Copy Paper (Ream)',
        category: InventoryCategory.OFFICE_SUPPLIES,
        unit: UnitOfMeasure.BOXES,
        initialStock: 10,
        recordedByUserId: actorId,
      });
      expect(paper.category).toBe(InventoryCategory.OFFICE_SUPPLIES);

      // 5. Supplements
      const supplement = InventoryItem.create({
        sku: 'SUP-WHEY-ISOLATE',
        name: 'Whey Protein Isolate 1kg (Vanilla)',
        category: InventoryCategory.SUPPLEMENTS,
        unit: UnitOfMeasure.UNITS,
        initialStock: 20,
        sellingPrice: { amount: 55.0, currency: 'USD' },
        recordedByUserId: actorId,
      });
      expect(supplement.category).toBe(InventoryCategory.SUPPLEMENTS);
      expect(INVENTORY_CATEGORY_REGISTRY[supplement.category].isRetailEligible).toBe(true);
    });

    it('rejects product creation when an invalid category is supplied', () => {
      expect(() =>
        InventoryItem.create({
          sku: 'INV-CAT-001',
          name: 'Invalid Category Item',
          category: 'UNREGISTERED_CATEGORY' as unknown as InventoryCategory,
          recordedByUserId: actorId,
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });

    it('rejects product catalog update when an invalid category is supplied', () => {
      const item = InventoryItem.create({
        sku: 'INV-CAT-002',
        name: 'Standard Supplies',
        category: InventoryCategory.OFFICE_SUPPLIES,
        recordedByUserId: actorId,
      });

      expect(() =>
        item.updateCatalogDetails({
          category: 'BOGUS_CATEGORY' as unknown as InventoryCategory,
        }),
      ).toThrow(InvalidInventoryItemStateException);

      // Category remains unchanged
      expect(item.category).toBe(InventoryCategory.OFFICE_SUPPLIES);
    });

    it('rejects aggregate reconstitution when persistent snapshot contains invalid category', () => {
      expect(() =>
        InventoryItem.reconstitute({
          id: '123e4567-e89b-12d3-a456-426614174000',
          sku: 'INV-CAT-003',
          name: 'Corrupted Database Record',
          category: 'CORRUPTED_ENUM_VALUE' as unknown as InventoryCategory,
          unit: UnitOfMeasure.UNITS,
          minimumStock: 0,
          quantityOnHand: 10,
          purchaseCost: { amount: 5, currency: 'USD' },
          sellingPrice: { amount: 10, currency: 'USD' },
          status: InventoryItemStatus.ACTIVE,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow(InvalidInventoryItemStateException);
    });
  });
});
