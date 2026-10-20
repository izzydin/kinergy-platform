import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  GetTreatmentSessionByIdHandler,
  StartTreatmentSessionHandler,
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  CancelTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  PrismaAppointmentRepository,
} from '@kinergy-platform/core';
import { KinesiologyModule } from '../kinesiology.module';
import { TreatmentSessionsController } from '../controllers/treatment-sessions.controller';
import {
  TREATMENT_SESSION_REPOSITORY_TOKEN,
  SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN,
  KINESIOLOGY_CLOCK_TOKEN,
} from '../kinesiology.tokens';
import {
  PrismaTreatmentSessionRepository,
  InMemoryTreatmentSessionRepository,
} from '../infrastructure';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';

import { AUTHORIZATION_EVALUATOR } from '../../platform/identity/authorization/authorization-evaluator.interface';
import { ACCESS_TOKEN_SERVICE } from '../../platform/identity/tokens/access-token.service';
import { USER_REPOSITORY } from '../../platform/identity/domain';

const mockPrisma = {
  getClient: jest.fn().mockReturnValue({}),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useValue: mockPrisma,
    },
    {
      provide: AUTHORIZATION_EVALUATOR,
      useValue: {
        evaluate: jest.fn().mockResolvedValue(true),
      },
    },
    {
      provide: ACCESS_TOKEN_SERVICE,
      useValue: {
        verifyToken: jest.fn(),
      },
    },
    {
      provide: USER_REPOSITORY,
      useValue: {
        findById: jest.fn(),
      },
    },
  ],
  exports: [PrismaService, AUTHORIZATION_EVALUATOR, ACCESS_TOKEN_SERVICE, USER_REPOSITORY],
})
class GlobalMockPlatformModule {}

describe('KinesiologyModule Dependency Injection & Resolution', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [GlobalMockPlatformModule, KinesiologyModule],
    })
      .overrideProvider(PrismaAppointmentRepository)
      .useValue({
        findById: jest.fn(),
      })
      .compile();
  });

  it('compiles the module without missing dependency errors', () => {
    expect(moduleRef).toBeDefined();
  });

  it('resolves TreatmentSessionsController from the container', () => {
    const controller = moduleRef.get<TreatmentSessionsController>(TreatmentSessionsController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(TreatmentSessionsController);
  });

  it('resolves all required CQRS command and query handlers', () => {
    expect(
      moduleRef.get<CreateTreatmentSessionFromAppointmentHandler>(
        CreateTreatmentSessionFromAppointmentHandler,
      ),
    ).toBeDefined();
    expect(
      moduleRef.get<GetTreatmentSessionByIdHandler>(GetTreatmentSessionByIdHandler),
    ).toBeDefined();
    expect(moduleRef.get<StartTreatmentSessionHandler>(StartTreatmentSessionHandler)).toBeDefined();
    expect(
      moduleRef.get<AssignTherapistToSessionHandler>(AssignTherapistToSessionHandler),
    ).toBeDefined();
    expect(moduleRef.get<UpdateSessionNotesHandler>(UpdateSessionNotesHandler)).toBeDefined();
    expect(
      moduleRef.get<CompleteTreatmentSessionHandler>(CompleteTreatmentSessionHandler),
    ).toBeDefined();
    expect(
      moduleRef.get<CancelTreatmentSessionHandler>(CancelTreatmentSessionHandler),
    ).toBeDefined();
    expect(
      moduleRef.get<GetClientTreatmentHistoryHandler>(GetClientTreatmentHistoryHandler),
    ).toBeDefined();
  });

  it('resolves the infrastructure repository and tokens', () => {
    const repo = moduleRef.get(TREATMENT_SESSION_REPOSITORY_TOKEN);
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(PrismaTreatmentSessionRepository);

    const lookupPort = moduleRef.get(SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN);
    expect(lookupPort).toBeDefined();

    const clock = moduleRef.get(KINESIOLOGY_CLOCK_TOKEN);
    expect(clock).toBeDefined();
  });

  it('allows overriding repository with InMemoryTreatmentSessionRepository in tests', async () => {
    const inMemoryRepo = new InMemoryTreatmentSessionRepository();
    const testModule = await Test.createTestingModule({
      imports: [GlobalMockPlatformModule, KinesiologyModule],
    })
      .overrideProvider(TREATMENT_SESSION_REPOSITORY_TOKEN)
      .useValue(inMemoryRepo)
      .overrideProvider(PrismaAppointmentRepository)
      .useValue({ findById: jest.fn() })
      .compile();

    const resolvedRepo = testModule.get(TREATMENT_SESSION_REPOSITORY_TOKEN);
    expect(resolvedRepo).toBe(inMemoryRepo);
  });
});
