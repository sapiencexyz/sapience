import { describe, it, expect } from 'vitest';
import { introspect } from '../helpers/testApollo';

interface IntrospectionShape {
  __schema: {
    queryType: { name: string };
    mutationType: { name: string } | null;
    subscriptionType: { name: string } | null;
    types: Array<{ name: string }>;
    directives: unknown[];
  };
}

describe('introspection snapshot', () => {
  it('live server introspection matches the recorded contract', async () => {
    const data = (await introspect()) as IntrospectionShape;
    const filtered: IntrospectionShape = {
      __schema: {
        queryType: data.__schema.queryType,
        mutationType: data.__schema.mutationType,
        subscriptionType: data.__schema.subscriptionType,
        directives: data.__schema.directives,
        types: data.__schema.types
          .filter((t) => !t.name.startsWith('__'))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
    await expect(JSON.stringify(filtered, null, 2)).toMatchFileSnapshot(
      './__snapshots__/introspection.json'
    );
  });
});
