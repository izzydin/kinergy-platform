import { PotentialMatchDto } from '../../application/dto/potential-match.dto';
import { ClientAlreadyExistsException } from '../../application/exceptions/client-already-exists.exception';
import { ClientRepository } from '../repositories/client.repository';
import { ClientSearchRepository } from '../repositories/client-search.repository';
import { E164PhoneNumber } from '../value-objects/e164-phone-number.vo';
import { EmailAddress } from '../value-objects/email-address.vo';
import { ClientName } from '../value-objects/client-name.vo';
import { NormalizedSearchName } from '../value-objects/normalized-search-name.vo';
import { ClientStatus } from '../value-objects/client-status.enum';

export class ClientDuplicateCheckerService {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly clientSearchRepository?: ClientSearchRepository,
  ) {}

  /**
   * Asserts that no active client exists with the given email OR E.164 phone.
   * Throws ClientAlreadyExistsException if a hard duplicate is detected.
   */
  public async checkHardDuplicates(email: EmailAddress, phone: E164PhoneNumber): Promise<void> {
    const existingByEmail = await this.clientRepository.findByEmail(email);
    if (existingByEmail && existingByEmail.status === ClientStatus.ACTIVE) {
      throw new ClientAlreadyExistsException('email', email.value);
    }

    const existingByPhone = await this.clientRepository.findByPhone(phone);
    if (existingByPhone && existingByPhone.status === ClientStatus.ACTIVE) {
      throw new ClientAlreadyExistsException('phone', phone.value);
    }
  }

  /**
   * Evaluates potential soft duplicate matches based on normalized name or phone number.
   */
  public async findPotentialMatches(
    name: ClientName,
    phone: E164PhoneNumber,
  ): Promise<PotentialMatchDto[]> {
    const matches: PotentialMatchDto[] = [];
    const matchedIds = new Set<string>();

    const normalizedName = NormalizedSearchName.create(name);

    // 1. Search by name similarity if search repository is provided
    if (this.clientSearchRepository) {
      const nameMatches = await this.clientSearchRepository.searchByName(normalizedName);
      for (const client of nameMatches) {
        if (client.status === ClientStatus.ACTIVE && !matchedIds.has(client.id)) {
          matchedIds.add(client.id);
          matches.push({
            clientId: client.id,
            referenceNumber: client.referenceNumber.value,
            fullName: client.name.fullName,
            email: client.email.value,
            phone: client.phone.value,
            matchReason: 'SIMILAR_NAME',
          });
        }
      }
    }

    // 2. Search by phone match via repository
    const phoneMatch = await this.clientRepository.findByPhone(phone);
    if (phoneMatch && phoneMatch.status === ClientStatus.ACTIVE && !matchedIds.has(phoneMatch.id)) {
      matchedIds.add(phoneMatch.id);
      matches.push({
        clientId: phoneMatch.id,
        referenceNumber: phoneMatch.referenceNumber.value,
        fullName: phoneMatch.name.fullName,
        email: phoneMatch.email.value,
        phone: phoneMatch.phone.value,
        matchReason: 'EXACT_PHONE',
      });
    }

    return matches;
  }
}
