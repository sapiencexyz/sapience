'use client';

import { motion } from 'framer-motion';
import StackedPredictions, {
  type Pick,
} from '~/components/shared/StackedPredictions';
import { formatPythPriceDecimalFromInt } from '~/lib/auction/decodePredictedOutcomes';
import { usePythFeedLabel } from '~/lib/pyth/usePythFeedLabel';

type PythPick = {
  priceId: `0x${string}`;
  endTime: bigint;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
  prediction: boolean;
};

export function PythPredictionsCell({ first }: { first: PythPick }) {
  const feedLabel = usePythFeedLabel(first.priceId);
  const priceStr = formatPythPriceDecimalFromInt(
    first.strikePrice,
    first.strikeExpo
  );

  // Taker perspective: invert the maker's prediction
  const takerChoice = first.prediction ? 'No' : 'Yes';
  const question = `${feedLabel ?? 'Crypto'} OVER $${priceStr}`;

  const picks: Pick[] = [
    {
      question,
      choice: takerChoice,
      source: 'pyth',
      categorySlug: 'prices',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      <StackedPredictions picks={picks} className="max-w-full" />
    </motion.div>
  );
}
