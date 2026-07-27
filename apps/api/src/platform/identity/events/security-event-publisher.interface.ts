import { SecurityEvent } from './security-event.interface';

/**
 * Abstract Port Interface for Publishing Structured Security Events.
 * Decouples use cases from event routing infrastructure (Kafka, RabbitMQ, SIEM, Audit logs).
 */
export interface ISecurityEventPublisher {
  publish(event: SecurityEvent): Promise<void>;
}

/**
 * Dependency Injection Symbol for NestJS binding.
 */
export const SECURITY_EVENT_PUBLISHER = Symbol('ISecurityEventPublisher');
