import { HttpStatus } from '@nestjs/common';
import { InventoryCategory, UnitOfMeasure } from '@kinergy-platform/core';
import { CreateInventoryItemRequestDto, InventoryItemResponseDto } from '../../dto';
import { TestApiClient } from './api-client';
import { TestPersona } from './auth-personas';

let skuCounter = 100;

export interface ProductFactoryOverrides extends Partial<CreateInventoryItemRequestDto> {
  sku?: string;
  name?: string;
  category?: InventoryCategory;
  unitCost?: number;
  sellingPrice?: number;
  quantityOnHand?: number;
}

export class InventoryProductFactory {
  constructor(private readonly client: TestApiClient) {}

  public async create(
    actor: TestPersona,
    overrides?: ProductFactoryOverrides,
  ): Promise<InventoryItemResponseDto> {
    skuCounter++;
    const payload: CreateInventoryItemRequestDto = {
      sku: overrides?.sku ?? `SKU-PROD-${skuCounter}-${Date.now().toString().slice(-4)}`,
      name: overrides?.name ?? `Test Product ${skuCounter}`,
      category: overrides?.category ?? InventoryCategory.HEALTHY_DRINKS,
      unitCost: overrides?.unitCost ?? 5.0,
      sellingPrice: overrides?.sellingPrice ?? 10.0,
      quantityOnHand: overrides?.quantityOnHand ?? 0,
      unitOfMeasure: (overrides?.unitOfMeasure as UnitOfMeasure) ?? UnitOfMeasure.BOTTLES,
      reorderThreshold: overrides?.reorderThreshold ?? 10,
      description: overrides?.description ?? 'E2E Test Inventory Product',
    };

    const res = await this.client.as(actor).post('/api/v1/resources/inventory').send(payload);

    if (res.status !== HttpStatus.CREATED) {
      throw new Error(
        `InventoryProductFactory.create failed with HTTP ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }

    return res.body as InventoryItemResponseDto;
  }
}
