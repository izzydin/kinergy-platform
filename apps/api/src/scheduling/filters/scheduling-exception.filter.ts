import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  SchedulingDomainException,
  OptimisticLockException,
  AppointmentConflictException,
  TherapistUnavailableException,
  RoomUnavailableException,
  ClientUnavailableException,
  InvalidAppointmentTransitionException,
  InvalidDurationException,
  InvalidTimeRangeException,
  WorkingHoursViolationException,
  BookingWindowViolationException,
} from '@kinergy-platform/core';

@Catch()
export class SchedulingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof OptimisticLockException) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (
      exception instanceof AppointmentConflictException ||
      exception instanceof TherapistUnavailableException ||
      exception instanceof RoomUnavailableException ||
      exception instanceof ClientUnavailableException
    ) {
      const conflictEx = exception as SchedulingDomainException;
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: conflictEx.code,
        message: conflictEx.message,
      });
      return;
    }

    if (
      exception instanceof InvalidAppointmentTransitionException ||
      exception instanceof InvalidDurationException ||
      exception instanceof InvalidTimeRangeException ||
      exception instanceof WorkingHoursViolationException ||
      exception instanceof BookingWindowViolationException
    ) {
      const unprocEx = exception as SchedulingDomainException;
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code: unprocEx.code,
        message: unprocEx.message,
      });
      return;
    }

    if (exception instanceof SchedulingDomainException) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    // Re-throw if unhandled so default framework filters process it
    throw exception;
  }
}
