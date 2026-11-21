import { createClient } from '@insforge/sdk';

/**
 * InsForge public client.
 * Set VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY in the deployment environment.
 * Never use an InsForge project Admin/API key in browser code.
 */
const baseUrl = import.meta.env.VITE_INSFORGE_URL;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;

if (!baseUrl || !anonKey) {
  console.warn('InsForge is not configured. Set VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY.');
}

export const insforge = createClient({
  baseUrl: baseUrl || 'https://ebcpc73g.us-east.insforge.app',
  anonKey: anonKey || 'REPLACE_WITH_ROTATED_ANON_KEY',
});
