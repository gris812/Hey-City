import { AsyncLocalStorage } from 'node:async_hooks';

// Cache misses are charged to the request that initiated the provider call.
export const requestContext = new AsyncLocalStorage<{ userId: string }>();
