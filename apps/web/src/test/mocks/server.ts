import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Node Server setup for Vitest unit & integration test mocking
 */
export const server = setupServer(...handlers);
