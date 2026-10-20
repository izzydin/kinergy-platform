import { Injectable } from '@nestjs/common';
import { Prisma, SessionStatus as PrismaSessionStatus } from '@prisma/client';
import {
  ITreatmentSessionRepository,
  TreatmentHistoryFilter,
  TreatmentSession,
  SessionId,
  SessionStatus,
  SessionNotes,
  TreatmentHistorySummaryDTO,
  PaginatedTreatmentHistoryDTO,
} from '@kinergy-platform/core';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';

/**
 * Production Prisma persistence adapter for Kinesiology TreatmentSession aggregates.
 * Adheres to DDD aggregate boundaries and maps relational models to domain aggregates.
 */
@Injectable()
export class PrismaTreatmentSessionRepository implements ITreatmentSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get client() {
    return this.prisma.getClient();
  }

  public async findById(id: SessionId): Promise<TreatmentSession | null> {
    const raw = await this.client.treatmentSession.findUnique({
      where: { id: id.getValue() },
    });
    if (!raw) return null;
    return this.toDomain(raw);
  }

  public async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    const raw = await this.client.treatmentSession.findUnique({
      where: { appointmentId },
    });
    if (!raw) return null;
    return this.toDomain(raw);
  }

  public async save(session: TreatmentSession): Promise<void> {
    const notes = session.notes;
    await this.client.treatmentSession.upsert({
      where: { id: session.id.getValue() },
      create: {
        id: session.id.getValue(),
        clientId: session.clientId,
        therapistId: session.therapistId,
        appointmentId: session.appointmentId,
        status: session.status as unknown as PrismaSessionStatus,
        cancellationReason: session.cancellationReason ?? null,
        notesSubjective: notes.getSubjective() ?? null,
        notesObjective: notes.getObjective() ?? null,
        notesAssessment: notes.getAssessment() ?? null,
        notesPlan: notes.getPlan() ?? null,
        notesRawText: notes.getRawText() ?? null,
        version: session.version,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      update: {
        therapistId: session.therapistId,
        status: session.status as unknown as PrismaSessionStatus,
        cancellationReason: session.cancellationReason ?? null,
        notesSubjective: notes.getSubjective() ?? null,
        notesObjective: notes.getObjective() ?? null,
        notesAssessment: notes.getAssessment() ?? null,
        notesPlan: notes.getPlan() ?? null,
        notesRawText: notes.getRawText() ?? null,
        version: session.version,
        updatedAt: session.updatedAt,
      },
    });
  }

  public async findHistoryByClientId(
    clientId: string,
    filter: TreatmentHistoryFilter,
  ): Promise<PaginatedTreatmentHistoryDTO> {
    const page = Math.max(1, filter.pagination.page);
    const limit = Math.max(1, Math.min(50, filter.pagination.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.TreatmentSessionWhereInput = {
      clientId,
      ...(filter.status ? { status: filter.status as unknown as PrismaSessionStatus } : {}),
      ...(filter.therapistId ? { therapistId: filter.therapistId } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
    };

    const [total, records] = await Promise.all([
      this.client.treatmentSession.count({ where }),
      this.client.treatmentSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const items: TreatmentHistorySummaryDTO[] = records.map((record) => {
      const hasFullNotes = !!(
        record.notesSubjective ||
        record.notesObjective ||
        record.notesAssessment ||
        record.notesPlan ||
        record.notesRawText
      );
      const notesSummary =
        record.notesAssessment || record.notesSubjective || record.notesRawText || undefined;

      return {
        sessionId: record.id,
        clientId: record.clientId,
        appointmentId: record.appointmentId,
        therapistId: record.therapistId,
        status: record.status as unknown as SessionStatus,
        notesSummary: notesSummary ? notesSummary.slice(0, 150) : undefined,
        hasFullNotes,
        version: record.version,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  private toDomain(raw: {
    id: string;
    clientId: string;
    therapistId: string;
    appointmentId: string;
    status: PrismaSessionStatus | string;
    cancellationReason: string | null;
    notesSubjective: string | null;
    notesObjective: string | null;
    notesAssessment: string | null;
    notesPlan: string | null;
    notesRawText: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): TreatmentSession {
    const notes = SessionNotes.create({
      subjective: raw.notesSubjective ?? undefined,
      objective: raw.notesObjective ?? undefined,
      assessment: raw.notesAssessment ?? undefined,
      plan: raw.notesPlan ?? undefined,
      rawText: raw.notesRawText ?? undefined,
    });

    return TreatmentSession.reconstitute({
      id: SessionId.create(raw.id),
      version: raw.version,
      status: raw.status as SessionStatus,
      clientId: raw.clientId,
      therapistId: raw.therapistId,
      appointmentId: raw.appointmentId,
      cancellationReason: raw.cancellationReason ?? undefined,
      notes,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
