import PocketBase from 'pocketbase';

// 1. Force the URL to be relative in production. 
// This allows it to work behind any Reverse Proxy (Traefik, Nginx, Synology) 
// without needing to know the domain name ahead of time.
const url = import.meta.env.DEV 
  ? 'http://127.0.0.1:8090' 
  : window.location.origin; // e.g., "https://familysync.mydomain.com"

export const pb = new PocketBase(url);

// Disable auto-cancellation to prevent race conditions during rapid clicks
pb.autoCancellation(false);