import { describe, it, expect } from 'vitest';
import { readCommittedSchema } from '../helpers/testSchema';

describe('schema snapshot', () => {
  it('committed schema.graphql matches the recorded contract', async () => {
    const sdl = await readCommittedSchema();
    await expect(sdl).toMatchFileSnapshot(
      './__snapshots__/schema.sdl.graphql'
    );
  });
});
