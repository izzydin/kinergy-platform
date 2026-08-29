import { CommandHandler } from '../shared/command-handler.interface';
import { ApplicationResult } from '../shared/application-result';
import { ChangeFixedAssetStatusCommand } from '../commands/change-fixed-asset-status.command';
import { FixedAssetDTO } from '../dtos/fixed-asset.dto';
import { FixedAssetRepositoryInterface } from '../../domain/assets/repositories/fixed-asset.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { AssetId } from '../../domain/assets/value-objects/asset-id.vo';
import { isAssetStatus } from '../../domain/assets/enums/asset-status.enum';
import { FixedAssetDtoMapper } from '../mappers/fixed-asset-dto.mapper';

export class ChangeFixedAssetStatusHandler implements CommandHandler<
  ChangeFixedAssetStatusCommand,
  ApplicationResult<FixedAssetDTO>
> {
  constructor(
    private readonly assetRepository: FixedAssetRepositoryInterface,
    private readonly eventPublisher?: ResourcesEventPublisherPort,
  ) {}

  async execute(command: ChangeFixedAssetStatusCommand): Promise<ApplicationResult<FixedAssetDTO>> {
    const { input } = command;

    try {
      // 1. Mandatory actor assertion
      if (!input.actorId || input.actorId.trim().length === 0) {
        return ApplicationResult.fail('Authenticated actor ID is required to change asset status.');
      }

      // 2. Mandatory reason assertion (min 3 chars)
      if (!input.reason || input.reason.trim().length < 3) {
        return ApplicationResult.fail(
          'Mandatory reason for status change must be at least 3 characters.',
        );
      }

      // 3. Enum validation
      if (!isAssetStatus(input.status)) {
        return ApplicationResult.fail(`Invalid asset status '${input.status}'.`);
      }

      // 4. Validate and parse AssetId UUID
      let assetId: AssetId;
      try {
        assetId = AssetId.create(input.id);
      } catch {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 5. Retrieve aggregate and verify tenant boundary
      const asset = await this.assetRepository.findById(assetId);
      if (!asset) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      if (input.tenantId && asset.tenantId && asset.tenantId !== input.tenantId) {
        return ApplicationResult.fail(`Fixed asset with ID '${input.id}' was not found.`);
      }

      // 6. Execute domain status transition (enforces state machine & invariants)
      asset.changeStatus(input.status, input.actorId, input.reason.trim());

      // 7. Persist aggregate update and append history atomically
      await this.assetRepository.save(asset);

      // 8. Publish domain events via integration bus
      if (this.eventPublisher) {
        const events = asset.getUncommittedEvents();
        if (events.length > 0) {
          await this.eventPublisher.publish(events);
          asset.clearEvents();
        }
      }

      return ApplicationResult.ok(FixedAssetDtoMapper.toDTO(asset));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to change fixed asset status';
      return ApplicationResult.fail(message);
    }
  }
}
