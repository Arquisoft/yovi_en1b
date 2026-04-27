/**
 * MSW Node Server Setup
 * 
 * Creates a mock HTTP server for Node.js/Vitest testing environment.
 * Used to intercept API calls during unit and integration tests.
 * 
 * How it works:
 * 1. Initializes in test setup (vitest.setup.ts)
 * 2. Intercepts all fetch/axios calls in Node context
 * 3. Routes to matching handler in handlers.ts
 * 4. Returns mock response synchronously in tests
 * 
 * Lifecycle:
 * - beforeAll: server.listen()
 * - afterEach: server.resetHandlers()
 * - afterAll: server.close()
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW Node Server
 * Initialized with all HTTP handlers for test requests
 */
export const server = setupServer(...handlers);

