import request from 'supertest';
import { TestPersona } from './auth-personas';

type SupertestServer = Parameters<typeof request>[0];

export class TestApiClient {
  private activePersona?: TestPersona;

  constructor(private readonly server: SupertestServer) {}

  public as(persona: TestPersona): this {
    this.activePersona = persona;
    return this;
  }

  public withoutAuth(): this {
    this.activePersona = undefined;
    return this;
  }

  public get(url: string): request.Test {
    const req = request(this.server).get(url);
    return this.applyHeaders(req);
  }

  public post(url: string): request.Test {
    const req = request(this.server).post(url);
    return this.applyHeaders(req);
  }

  public patch(url: string): request.Test {
    const req = request(this.server).patch(url);
    return this.applyHeaders(req);
  }

  public delete(url: string): request.Test {
    const req = request(this.server).delete(url);
    return this.applyHeaders(req);
  }

  private applyHeaders(req: request.Test): request.Test {
    if (this.activePersona) {
      req.set('Authorization', `Bearer ${this.activePersona.token}`);
      if (this.activePersona.tenantId) {
        req.set('x-tenant-id', this.activePersona.tenantId);
      }
    }
    return req;
  }
}
