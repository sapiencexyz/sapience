import { describe, it, expect, beforeAll } from 'vitest';

// Importing db.ts is side-effect free: `config` is lazily validated on
// first property access and the PrismaClient is created lazily in
// getInstance(), so no DB connection or env validation happens at import.
// We still set a dummy DATABASE_URL so any accidental access is benign.
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/test';

type DbModule = typeof import('./db');
let db: DbModule;

beforeAll(async () => {
  db = await import('./db');
});

const resolveAfter =
  <T>(ms: number, value: T) =>
  (): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe('withQueryTimeout', () => {
  it('rejects with a labelled error when the operation exceeds the timeout', async () => {
    await expect(
      db.withQueryTimeout(resolveAfter(80, 'late'), {
        label: 'Category.findFirst',
        timeoutMs: 20,
      })
    ).rejects.toThrow('Query timeout: Category.findFirst exceeded 20ms');
  });

  it('resolves when the operation finishes before the timeout', async () => {
    await expect(
      db.withQueryTimeout(resolveAfter(5, 'fast'), {
        label: 'Category.findFirst',
        timeoutMs: 200,
      })
    ).resolves.toBe('fast');
  });

  it('bypasses the timeout inside runWithoutQueryTimeout (boot/seed queries)', async () => {
    // The fix for the boot-timeout -> permanent-502 incident: a one-time
    // seeding query slower than the request-path timeout must NOT be aborted.
    await expect(
      db.runWithoutQueryTimeout(() =>
        db.withQueryTimeout(resolveAfter(80, 'seeded'), {
          label: 'Category.findFirst',
          timeoutMs: 20,
        })
      )
    ).resolves.toBe('seeded');
  });
});
