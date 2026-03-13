import { describe, it, expect } from 'vitest';
import { parse, GraphQLError } from 'graphql';
import { validateQuery } from './queryValidation.js';

describe('queryValidation', () => {
  const defaultOptions = {
    maxListSize: 100,
    maxFieldAliases: 3,
  };

  describe('pagination limits', () => {
    it('allows take within limit', () => {
      const query = parse(`{ items(take: 50) { id } }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });

    it('allows take at exact limit', () => {
      const query = parse(`{ items(take: 100) { id } }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });

    it('rejects take exceeding limit', () => {
      const query = parse(`{ items(take: 500) { id } }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Argument "take" exceeds maximum allowed value of 100 (got 500)'
      );
    });

    it('rejects first exceeding limit', () => {
      const query = parse(`{ items(first: 200) { id } }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Argument "first" exceeds maximum allowed value of 100 (got 200)'
      );
    });

    it('rejects limit exceeding max', () => {
      const query = parse(`{ items(limit: 150) { id } }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Argument "limit" exceeds maximum allowed value of 100 (got 150)'
      );
    });

    it('checks nested pagination arguments', () => {
      const query = parse(`{
        items(take: 10) {
          children(take: 500) { id }
        }
      }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Argument "take" exceeds maximum allowed value of 100 (got 500)'
      );
    });

    it('validates pagination args from variables', () => {
      const query = parse(`
        query GetItems($take: Int!) {
          items(take: $take) { id }
        }
      `);
      expect(() =>
        validateQuery(query, {
          ...defaultOptions,
          variables: { take: 500 },
        })
      ).toThrow(
        'Argument "take" exceeds maximum allowed value of 100 (got 500)'
      );
    });

    it('allows valid pagination from variables', () => {
      const query = parse(`
        query GetItems($take: Int!) {
          items(take: $take) { id }
        }
      `);
      expect(() =>
        validateQuery(query, {
          ...defaultOptions,
          variables: { take: 50 },
        })
      ).not.toThrow();
    });
  });

  describe('field alias limits', () => {
    it('allows different fields without limit', () => {
      const query = parse(`{
        items { id }
        users { id }
        categories { id }
        conditions { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });

    it('allows aliases within limit', () => {
      const query = parse(`{
        a1: items { id }
        a2: items { id }
        a3: items { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });

    it('rejects aliases exceeding limit', () => {
      const query = parse(`{
        a1: items { id }
        a2: items { id }
        a3: items { id }
        a4: items { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Field "items" is used 4 times, exceeding the maximum of 3 aliases per field'
      );
    });

    it('rejects the attack query pattern', () => {
      const query = parse(`{
        a1: conditions(take: 100) { id }
        a2: conditions(take: 100) { id }
        a3: conditions(take: 100) { id }
        a4: conditions(take: 100) { id }
        a5: conditions(take: 100) { id }
        a6: conditions(take: 100) { id }
        a7: conditions(take: 100) { id }
        a8: conditions(take: 100) { id }
        a9: conditions(take: 100) { id }
        a10: conditions(take: 100) { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Field "conditions" is used 4 times, exceeding the maximum of 3 aliases per field'
      );
    });

    it('allows nested aliases of the same field', () => {
      // Alias limits only apply at root level
      const query = parse(`{
        items {
          a1: children { id }
          a2: children { id }
          a3: children { id }
          a4: children { id }
          a5: children { id }
        }
      }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });

    it('tracks each field independently', () => {
      const query = parse(`{
        a1: items { id }
        a2: items { id }
        a3: items { id }
        b1: users { id }
        b2: users { id }
        b3: users { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });
  });

  describe('combined validation', () => {
    it('rejects pagination before checking aliases', () => {
      // Pagination check happens first during traversal
      const query = parse(`{
        a1: items(take: 500) { id }
        a2: items { id }
        a3: items { id }
        a4: items { id }
      }`);
      expect(() => validateQuery(query, defaultOptions)).toThrow(
        'Argument "take" exceeds maximum allowed value of 100 (got 500)'
      );
    });

    it('allows legitimate complex queries', () => {
      const query = parse(`{
        items(take: 50) {
          id
          name
          children(take: 20) { id }
        }
        otherItems: items(take: 30) { id }
        users(take: 100) { id name }
      }`);
      expect(() => validateQuery(query, defaultOptions)).not.toThrow();
    });
  });

  describe('HTTP status codes', () => {
    it('returns 400 for pagination limit exceeded', () => {
      const query = parse(`{ items(take: 500) { id } }`);
      try {
        validateQuery(query, defaultOptions);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        const gqlErr = err as GraphQLError;
        expect(gqlErr.extensions?.code).toBe('PAGINATION_LIMIT_EXCEEDED');
        expect((gqlErr.extensions?.http as { status: number })?.status).toBe(
          400
        );
      }
    });

    it('returns 400 for field alias limit exceeded', () => {
      const query = parse(`{
        a1: items { id }
        a2: items { id }
        a3: items { id }
        a4: items { id }
      }`);
      try {
        validateQuery(query, { ...defaultOptions, maxFieldAliases: 3 });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GraphQLError);
        const gqlErr = err as GraphQLError;
        expect(gqlErr.extensions?.code).toBe('FIELD_ALIAS_LIMIT_EXCEEDED');
        expect((gqlErr.extensions?.http as { status: number })?.status).toBe(
          400
        );
      }
    });
  });
});
