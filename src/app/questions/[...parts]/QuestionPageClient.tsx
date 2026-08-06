'use client';

import QuestionPageContent from '~/components/markets/pages/QuestionPageContent';

type Props = {
  parts: string[];
};

export default function QuestionPageClient({ parts }: Props) {
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
}
