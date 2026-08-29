import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { TransferFixedAssetLocationCommand } from '../commands/transfer-fixed-asset-location.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { AssetLocation } from '../../domain/assets/value-objects/asset-location.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class TransferFixedAssetLocationHandler implements CommandHandler<
  TransferFixedAssetLocationCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(
    command: TransferFixedAssetLocationCommand,
  ): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      // 1. Validate mandatory authenticated actor ID
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail('Authenticated actor ID is required to transfer an asset.');
      }

      // 2. Validate and parse AssetId
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.id);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 3. Retrieve aggregate and verify existence & tenant boundary
      const asset = await this.assetRepository.findById(assetId);
      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 4. Validate and construct destination AssetLocation Value Object
      const targetLocation = AssetLocation.create({
        facilityId: input.location.facilityId,
        roomId: input.location.roomId,
        zone: input.location.zone,
        description: input.location.description,
      });

      const initialVersion = asset.version;

      // 5. Execute domain transfer operation (enforces lifecycle invariants [AST-INV-1], [AST-INV-2], [AST-INV-3])
      asset.transferLocation(targetLocation, input.actorId, input.reason);

      // 6. Persist atomically only if location changed (idempotent no-op skip)
      if (asset.version > initialVersion) {
        await this.assetRepository.save(asset);

        // 7. Publish domain events via integration bus
        if (this.eventPublisher) {
          const events = asset.getUncommittedEvents();
          if (events.length > 0) {
            await this.eventPublisher.publish(events);
            asset.clearEvents();
          }
        }
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to transfer asset location';
      return ApplicationResult.fail(message);
    }
  }
}
