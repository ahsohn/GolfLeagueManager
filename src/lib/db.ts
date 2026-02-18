import { neon, NeonQueryFunction } from '@neondatabase/serverless';

// Lazily initialize the Neon client so builds without DATABASE_URL succeed.
// The client is created on the first query, not at module load time.
let _sql: NeonQueryFunction<false, false> | undefined;

function getClient(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = neon(url);
  }
  return _sql;
}

// Re-export a proxy so callers keep the same `sql\`...\`` tagged-template API.
export const sql = new Proxy(
  // Placeholder target; all operations are forwarded to the lazy client.
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
