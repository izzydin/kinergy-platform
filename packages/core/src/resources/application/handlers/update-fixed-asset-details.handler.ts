import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { UpdateFixedAssetDetailsCommand } from '../commands/update-fixed-asset-details.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class UpdateFixedAssetDetailsHandler implements CommandHandler<
  UpdateFixedAssetDetailsCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(
    command: UpdateFixedAssetDetailsCommand,
  ): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail(
          'Authenticated actor ID is required to update asset details.',
        );
      }

      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.id);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      const asset = await this.assetRepository.findById(assetId);

      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      const initialVersion = asset.version;

      // Update descriptive metadata
      asset.updateDetails(
        {
          name: input.name,
          description: input.description,
          notes: input.notes,
        },
        input.actorId,
        input.reason,
      );

      // Persist OCC update only if aggregate state actually changed
      if (asset.version > initialVersion) {
        await this.assetRepository.save(asset);

        // Publish events if any
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
      const message =
        error instanceof Error ? error.message : 'Failed to update fixed asset details';
      return ApplicationResult.fail(message);
    }
  }
}
