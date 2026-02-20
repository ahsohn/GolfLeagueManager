import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// Create a fresh Neon client on every call to avoid stale connections
// after database branch changes.
function getClient(): NeonQueryFunction<false, false> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL environment variable is not set');
  return neon(url);
}

// Re-export a proxy so callers keep the same `sql\`...\`` tagged-template API.
export const sql = new Proxy(
  // Placeholder target; all operations are forwarded to a fresh client.
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_t, _this, args) {
      return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_t, prop) {
      return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
    },
  }
);
