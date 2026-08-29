import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { CreateFixedAssetCommand } from '../commands/create-fixed-asset.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { FixedAsset } from '../../domain/assets/fixed-asset.aggregate';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { Money } from '../../domain/inventory/value-objects/money.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class CreateFixedAssetHandler implements CommandHandler<
  CreateFixedAssetCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(command: CreateFixedAssetCommand): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      // 1. Mandatory actor assertion
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail('Authenticated actor ID is required to register an asset.');
      }

      // 2. Duplicate Asset Tag check
      const normalizedTag = input.assetTag.trim().toUpperCase();
      const existing = await this.assetRepository.findByAssetTag(normalizedTag, input.tenantId);
      if (existing) {
        return ApplicationResult.fail(
          `Fixed asset with asset tag '${normalizedTag}' already exists.`,
        );
      }

      // 3. Monetary value validation (purchaseValue >= 0, currentEstimatedValue >= 0)
      if (input.purchaseValue.amount < 0) {
        return ApplicationResult.fail('Purchase value amount cannot be negative.');
      }
      if (input.currentEstimatedValue && input.currentEstimatedValue.amount < 0) {
        return ApplicationResult.fail('Current estimated value amount cannot be negative.');
      }

      const purchaseValue = Money.create(
        input.purchaseValue.amount,
        input.purchaseValue.currency || 'USD',
      );
      const estimatedValue = input.currentEstimatedValue
        ? Money.create(
            input.currentEstimatedValue.amount,
            input.currentEstimatedValue.currency || purchaseValue.currency,
          )
        : purchaseValue;

      // 4. Location construction & validation
      const location = AssetLocation.create({
        facilityId: input.location.facilityId,
        roomId: input.location.roomId,
        zone: input.location.zone,
        description: input.location.description,
      });

      // 5. Aggregate instantiation & initial CREATED history event generation
      const asset = FixedAsset.create(
        {
          tenantId: input.tenantId,
          assetTag: normalizedTag,
          name: input.name,
          description: input.description,
          category: input.category,
          purchaseDate: input.purchaseDate,
          purchaseValue,
          currentEstimatedValue: estimatedValue,
          condition: input.condition,
          status: input.status,
          location,
          notes: input.notes,
        },
        input.actorId,
      );

      // 6. Persistence
      await this.assetRepository.save(asset);

      // 7. Domain event publication
      if (this.eventPublisher) {
        const events = asset.getUncommittedEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
          asset.clearEvents();
        }
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create fixed asset';
      return ApplicationResult.fail(message);
    }
  }
}
