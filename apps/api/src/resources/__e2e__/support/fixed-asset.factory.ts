import { HttpStatus } from '@nestjs/common';
import { AssetCategory, AssetCondition } from '@kinergy-platform/core';
import { CreateFixedAssetRequestDto, FixedAssetResponseDto } from '../../dto';
import { TestApiClient } from './api-client';
import { TestPersona } from './auth-personas';

let tagCounter = 100;

export interface AssetFactoryOverrides extends Partial<CreateFixedAssetRequestDto> {
  assetTag?: string;
  name?: string;
  category?: AssetCategory;
  purchaseValueAmount?: number;
  currentEstimatedValueAmount?: number;
  condition?: AssetCondition;
}

export class FixedAssetFactory {
  constructor(private readonly client: TestApiClient) {}

  public async create(
    actor: TestPersona,
    overrides?: AssetFactoryOverrides,
  ): Promise<FixedAssetResponseDto> {
    tagCounter++;
    const payload: CreateFixedAssetRequestDto = {
      assetTag: overrides?.assetTag ?? `AST-FLEET-${tagCounter}-${Date.now().toString().slice(-4)}`,
      name: overrides?.name ?? `Test Asset Equipment ${tagCounter}`,
      category: overrides?.category ?? AssetCategory.THERAPY_EQUIPMENT,
      purchaseDate: overrides?.purchaseDate ?? '2026-01-15T00:00:00.000Z',
      purchaseValueAmount: overrides?.purchaseValueAmount ?? 5000.0,
      currentEstimatedValueAmount:
        overrides?.currentEstimatedValueAmount ?? overrides?.purchaseValueAmount ?? 5000.0,
      condition: overrides?.condition ?? AssetCondition.EXCELLENT,
      location: overrides?.location ?? {
        facilityId: 'fac_main',
        roomId: 'Room_101',
        zone: 'Clinical Suite',
        description: 'Primary treatment bay',
      },
      description: overrides?.description ?? 'E2E Capital Therapy Equipment',
      notes: overrides?.notes ?? 'Commissioned for clinical services',
    };

    const res = await this.client.as(actor).post('/api/v1/resources/assets').send(payload);

    if (res.status !== HttpStatus.CREATED) {
      throw new Error(
        `FixedAssetFactory.create failed with HTTP ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }

    return res.body as FixedAssetResponseDto;
  }
}
