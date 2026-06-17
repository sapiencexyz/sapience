// Dummy server env so test files that import config.ts (directly or via
// sponsorship.ts / submitLine.ts) don't trip cleanEnv. Real env wins (||=), so
// this only fills gaps in CI/local test runs — it never overrides a real value.
// Chain IO in tests is injected (SponsorshipDeps), so these are never used to
// sign or read anything.
const DUMMY_HEX32 = `0x${'00'.repeat(31)}01`;
process.env.SERVER_SECRET ||= DUMMY_HEX32;
process.env.ADMIN_TOKEN ||= 'test-admin-token';
process.env.MINTER_PRIVATE_KEY ||= DUMMY_HEX32;
