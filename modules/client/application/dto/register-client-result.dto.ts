import { Client } from '../../domain/aggregates/client.aggregate';
import { PotentialMatchDto } from './potential-match.dto';

export type RegisterClientResultStatus = 'SUCCESS' | 'POTENTIAL_DUPLICATES_FOUND';

export class RegisterClientResult {
  private constructor(
    public readonly status: RegisterClientResultStatus,
    public readonly client?: Client,
    public readonly potentialMatches?: PotentialMatchDto[],
  ) {}

  public static success(client: Client): RegisterClientResult {
    return new RegisterClientResult('SUCCESS', client, undefined);
  }

  public static potentialDuplicates(potentialMatches: PotentialMatchDto[]): RegisterClientResult {
    return new RegisterClientResult('POTENTIAL_DUPLICATES_FOUND', undefined, potentialMatches);
  }

  public get isSuccess(): boolean {
    return this.status === 'SUCCESS';
  }

  public get isPotentialDuplicates(): boolean {
    return this.status === 'POTENTIAL_DUPLICATES_FOUND';
  }
}
