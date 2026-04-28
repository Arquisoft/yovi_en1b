/**
 * MSW Browser Setup
 * 
 * Creates a service worker that intercepts HTTP requests in the browser during development.
 * Enable with: VITE_USE_MSW=true npm run dev:mock
 * 
 * How it works:
 * 1. Service worker runs in browser context
 * 2. Intercepts all fetch() calls to API endpoints
 * 3. Routes to matching handler in handlers.ts
 * 4. Returns mock response without hitting real server
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/**
 * MSW Browser Worker
 * Initialized with all HTTP handlers for frontend requests
 */
export const worker = setupWorker(...handlers);

