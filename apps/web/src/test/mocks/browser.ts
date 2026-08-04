import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * Browser Service Worker setup for Mock Service Worker (MSW v2)
 */
export const worker = setupWorker(...handlers);
