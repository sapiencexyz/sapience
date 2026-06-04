import { describe, expect, it } from 'vitest';

import { isCacheableGraphqlPath } from './index';

describe('isCacheableGraphqlPath', () => {
  it('matches the legacy /graphql endpoint', () => {
    expect(isCacheableGraphqlPath('/graphql')).toBe(true);
  });

  it('matches the /v2/graphql endpoint (widened gate)', () => {
    expect(isCacheableGraphqlPath('/v2/graphql')).toBe(true);
  });

  it('matches subpaths of both endpoints', () => {
    expect(isCacheableGraphqlPath('/graphql/')).toBe(true);
    expect(isCacheableGraphqlPath('/v2/graphql/')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(isCacheableGraphqlPath('/')).toBe(false);
    expect(isCacheableGraphqlPath('/health')).toBe(false);
    expect(isCacheableGraphqlPath('/v2')).toBe(false);
    expect(isCacheableGraphqlPath('/v3/graphql')).toBe(false);
  });

  it('does not match look-alike paths that merely share the /graphql prefix', () => {
    // The original gate used startsWith('/graphql'), which would have
    // incorrectly matched these. The widened gate is path-segment aware.
    expect(isCacheableGraphqlPath('/graphqlxyz')).toBe(false);
    expect(isCacheableGraphqlPath('/v2/graphqlxyz')).toBe(false);
  });
});
