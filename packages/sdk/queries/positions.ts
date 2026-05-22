// Intentionally empty.
//
// The hand-written `LegacyPosition` type that previously lived here was
// only consumed by ProfileQuickMetrics — and that consumer always
// received an empty array, so the dependency was effectively dead.
// Both have been removed alongside the V1 (NFT-based) holdings
// deprecation. Use `positionsConnection` for V2 holdings.
export {};
