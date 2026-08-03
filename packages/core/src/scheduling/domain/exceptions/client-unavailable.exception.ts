import { SchedulingDomainException } from './scheduling.exception';

export class ClientUnavailableException extends SchedulingDomainException {
  public readonly code = 'CLIENT_UNAVAILABLE';

  constructor(
    public readonly clientId: string,
    message?: string,
  ) {
    super(message ?? `Client '${clientId}' has a conflicting active appointment.`);
  }
}
