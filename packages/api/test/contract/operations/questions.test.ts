import { describe, it, expect } from 'vitest';
import { GET_QUESTIONS } from '../fixtures/v1-operations';
import { executeOperation } from '../../helpers/testApollo';
import { stabilize } from '../../helpers/stableSerializer';

// The frozen GET_QUESTIONS predates the questionType arg (#1840/#1841);
// this doc pins the filtered surface, which shipped with ZERO contract
// coverage — the gap that let the arg silently no-op after the merged v1
// resolver dropped it from its runner-input field list (staging
// regression, 2026-06-11).
const QUESTIONS_BY_TYPE = /* GraphQL */ `
  query QuestionsByType($questionType: QuestionItemType, $take: Int! = 50) {
    questions(questionType: $questionType, take: $take) {
      questionType
      condition {
        id
      }
      group {
        id
      }
    }
  }
`;

interface QuestionEnvelope {
  questionType: 'condition' | 'group';
  condition: { id: string } | null;
  group: { id: number } | null;
}

describe('Questions query', () => {
  it('matches the recorded contract', async () => {
    const result = await executeOperation(GET_QUESTIONS, {
      take: 10,
      skip: 0,
      sortField: 'openInterest',
      sortDirection: 'desc',
    });
    expect(result.errors).toBeUndefined();
    await expect(
      JSON.stringify(stabilize(result.data), null, 2)
    ).toMatchFileSnapshot('../__snapshots__/operations/questions.json');
  });

  it('questionType: condition returns only condition-rendered items', async () => {
    const result = await executeOperation<{ questions: QuestionEnvelope[] }>(
      QUESTIONS_BY_TYPE,
      { questionType: 'condition' }
    );
    expect(result.errors).toBeUndefined();
    const items = result.data?.questions ?? [];
    expect(items.length).toBeGreaterThan(0);
    // Behavioral pin, not a snapshot: with the filter dropped, the feed
    // returns group items here and this fails loudly.
    expect(items.filter((q) => q.questionType !== 'condition').length).toBe(0);
  });

  it('questionType: group returns only multi-condition group items', async () => {
    const result = await executeOperation<{ questions: QuestionEnvelope[] }>(
      QUESTIONS_BY_TYPE,
      { questionType: 'group' }
    );
    expect(result.errors).toBeUndefined();
    const items = result.data?.questions ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.filter((q) => q.questionType !== 'group').length).toBe(0);
  });
});
