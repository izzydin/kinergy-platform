import { ClientProfileDto } from '../dto/client-profile.dto';
import { ClientNotFoundException } from '../exceptions/client-already-exists.exception';
import { UpdateClientCommand } from '../commands/update-client.command';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientDuplicateCheckerService } from '../../domain/services/client-duplicate-checker.service';
import { ClientId } from '../../domain/value-objects/client-id.vo';
import { ClientName } from '../../domain/value-objects/client-name.vo';
import { EmailAddress } from '../../domain/value-objects/email-address.vo';
import { E164PhoneNumber } from '../../domain/value-objects/e164-phone-number.vo';
import { ClientMapper } from '../../infrastructure/persistence/prisma/client.mapper';

export class UpdateClientUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly duplicateChecker: ClientDuplicateCheckerService,
  ) {}

  public async execute(command: UpdateClientCommand): Promise<ClientProfileDto> {
    const clientId = ClientId.create(command.clientId);
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new ClientNotFoundException(command.clientId);
    }

    let updatedName: ClientName | undefined;
    if (command.firstName !== undefined || command.lastName !== undefined) {
      const firstName = command.firstName ?? client.name.firstName;
      const lastName = command.lastName ?? client.name.lastName;
      updatedName = ClientName.create(firstName, lastName);
    }

    let updatedEmail: EmailAddress | undefined;
    if (command.email !== undefined) {
      updatedEmail = EmailAddress.create(command.email);
    }

    let updatedPhone: E164PhoneNumber | undefined;
    if (command.phone !== undefined) {
      updatedPhone = E164PhoneNumber.create(command.phone);
    }

    // Perform duplicate check if email or phone changed
    const emailChanged = updatedEmail && updatedEmail.value !== client.email.value;
    const phoneChanged = updatedPhone && updatedPhone.value !== client.phone.value;

    if (emailChanged || phoneChanged) {
      const targetEmail = updatedEmail ?? client.email;
      const targetPhone = updatedPhone ?? client.phone;
      await this.duplicateChecker.checkHardDuplicates(targetEmail, targetPhone, client.id);
    }

    // Mutate domain aggregate state
    client.updateDetails({
      name: updatedName,
      email: updatedEmail,
      phone: updatedPhone,
      expectedVersion: command.expectedVersion,
    });

    // Save updated aggregate
    await this.clientRepository.save(client);

    return ClientMapper.toProfileDto(client, true);
  }
}
