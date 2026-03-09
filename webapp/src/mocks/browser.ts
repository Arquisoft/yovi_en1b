import { setupWorker } from 'msw/browser';

export const worker = setupWorker(...handlers);

import { handlers } from './handlers';
