import { AsyncLocalStorage } from 'async_hooks';

/**
 * Global AsyncLocalStorage instance to hold request context
 * across asynchronous operations in the Node.js runtime.
 * Useful for Mongoose plugins that need to know the active user.
 */
export const requestContext = new AsyncLocalStorage();
