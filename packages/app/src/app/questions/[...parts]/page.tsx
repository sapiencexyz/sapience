'use client';

import { useParams } from 'next/navigation';
import QuestionPageContent from '~/components/markets/pages/QuestionPageContent';

function normalizeParts(parts: string | string[] | undefined): string[] {
  if (!parts) return [];
  return Array.isArray(parts) ? parts : [parts];
}

const QuestionPage = () => {
  const params = useParams();
  const parts = normalizeParts(params.parts as string | string[] | undefined);

  // Canonical shape: /questions/:resolverAddress/:conditionId
  if (parts.length >= 2) {
    const resolverAddress = parts[0];
    const conditionId = parts[1];
    return (
      <QuestionPageContent
        conditionId={conditionId}
        resolverAddressFromUrl={resolverAddress}
      />
    );
  }

  // Legacy shape: /questions/:conditionId
  // QuestionPageContent will handle redirecting to canonical URL with resolver from GraphQL
  const conditionId = parts[0] as string | undefined;
  return conditionId ? <QuestionPageContent conditionId={conditionId} /> : null;
};

export default QuestionPage;
