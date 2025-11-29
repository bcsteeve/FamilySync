import PocketBase from 'pocketbase';

// In development, we point to localhost.
// In production (Docker), this will be relative to the domain.
const url = import.meta.env.DEV ? 'http://127.0.0.1:8090' : '/';

export const pb = new PocketBase(url);

// Disable auto-cancellation to prevent race conditions during rapid clicks
pb.autoCancellation(false);