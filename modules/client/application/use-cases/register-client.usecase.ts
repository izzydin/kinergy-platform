import { Client } from '../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../domain/value-objects';
import { RegisterClientCommand } from '../commands/register-client.command';
import { RegisterClientResult } from '../dto/register-client-result.dto';

export class RegisterClientUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly duplicateCheckerService: ClientDuplicateCheckerService,
  ) {}

  public async execute(command: RegisterClientCommand): Promise<RegisterClientResult> {
    const name = ClientName.create(command.firstName, command.lastName);
    const email = EmailAddress.create(command.email);
    const phone = E164PhoneNumber.create(command.phone);

    // 1. Hard Duplicate Check across all registration flows (Throws ClientAlreadyExistsException)
    await this.duplicateCheckerService.checkHardDuplicates(email, phone);

    // 2. Soft Duplicate Check (Only if staff/reception has not explicitly bypassed soft duplicates)
    if (!command.bypassSoftDuplicates) {
      const potentialMatches = await this.duplicateCheckerService.findPotentialMatches(name, phone);
      if (potentialMatches.length > 0) {
        return RegisterClientResult.potentialDuplicates(potentialMatches);
      }
    }

    // 3. Generate permanent reference number (e.g. CLI-YYYY-XXXXX)
    const referenceNumber = ClientReferenceNumber.create(
      new Date().getFullYear(),
      (Date.now() % 90000) + 10000,
    );

    // 4. Instantiate new Client aggregate root
    const client = Client.register({
      referenceNumber,
      name,
      email,
      phone,
      identityId: command.identityId ?? null,
    });

    // 5. Persist aggregate using repository contract
    await this.clientRepository.save(client);

    return RegisterClientResult.success(client);
  }
}
