'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { getQuestionHref } from '~/lib/utils/questionHref';
import QuestionPageContent from '~/components/markets/pages/QuestionPageContent';

function normalizeParts(parts: string | string[] | undefined): string[] {
  if (!parts) return [];
  return Array.isArray(parts) ? parts : [parts];
}

const QuestionPage = () => {
  const params = useParams();
  const router = useRouter();
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
  const conditionId = parts[0] as string | undefined;

  React.useEffect(() => {
    if (!conditionId) return;
    // Always redirect legacy URL to canonical URL once we know the chain.
    router.replace(
      getQuestionHref({ conditionId, chainId: CHAIN_ID_ETHEREAL })
    );
  }, [router, conditionId]);

  // While resolving redirect, render the page content (keeps behavior close to previous implementation).
  return conditionId ? <QuestionPageContent conditionId={conditionId} /> : null;
};

export default QuestionPage;
