import { Client as ClientPrismaModel } from '@prisma/client';
import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientProfileDto } from '../../../application/dto/client-profile.dto';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../../domain/value-objects';

export class ClientMapper {
  public static toDomain(record: ClientPrismaModel): Client {
    const id = ClientId.create(record.id);
    const referenceNumber = ClientReferenceNumber.from(record.referenceNumber);
    const name = ClientName.create(record.firstName, record.lastName);
    const email = EmailAddress.create(record.email);
    const phone = E164PhoneNumber.create(record.phone);
    const normalizedSearchName = NormalizedSearchName.create(record.normalizedSearchName);

    return Client.reconstitute(
      {
        referenceNumber,
        identityId: record.identityId,
        name,
        email,
        phone,
        normalizedSearchName,
        status: record.status as ClientStatus,
        version: record.version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      id,
    );
  }

  public static toPersistence(client: Client) {
    return {
      id: client.id,
      referenceNumber: client.referenceNumber.value,
      identityId: client.identityId,
      firstName: client.name.firstName,
      lastName: client.name.lastName,
      email: client.email.value,
      phone: client.phone.value,
      normalizedEmail: client.email.value,
      normalizedPhone: client.phone.value,
      normalizedSearchName: client.normalizedSearchName.value,
      status: client.status,
      version: client.version,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
  }

  public static toProfileDto(client: Client, includeIdentity = false): ClientProfileDto {
    const dto = new ClientProfileDto();
    dto.id = client.id;
    dto.referenceNumber = client.referenceNumber.value;
    dto.firstName = client.name.firstName;
    dto.lastName = client.name.lastName;
    dto.fullName = client.name.fullName;
    dto.email = client.email.value;
    dto.phone = client.phone.value;
    dto.status = client.status;
    dto.version = client.version;
    dto.createdAt = client.createdAt;
    dto.updatedAt = client.updatedAt;
    dto.identityId = includeIdentity ? client.identityId : null;
    return dto;
  }
}
