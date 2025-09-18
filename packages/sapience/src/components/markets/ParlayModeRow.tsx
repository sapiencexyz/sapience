'use client';

import * as React from 'react';
import { format, formatDistanceToNow, fromUnixTime } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import YesNoSplitButton from '~/components/shared/YesNoSplitButton';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';

export interface ParlayModeRowProps {
  condition: {
    id?: string;
    question: string;
    shortName?: string | null;
    category?: { id?: number; name?: string; slug?: string } | null;
    endTime?: number | null;
    claimStatement?: string | null;
    description?: string | null;
    similarMarkets?: string[] | null;
  };
  color: string;
}

const ParlayModeRow: React.FC<ParlayModeRowProps> = ({ condition, color }) => {
  const { id, question, shortName, endTime, description, similarMarkets } =
    condition;
  const { addParlaySelection } = useBetSlipContext();

  // Removed condition id display in dialog; keep id for keys only

  const endInfo = React.useMemo(() => {
    if (typeof endTime !== 'number' || endTime <= 0)
      return { date: '', relative: '' };
    let relative = '';
    try {
      relative = formatDistanceToNow(fromUnixTime(endTime), {
        addSuffix: true,
      });
    } catch {
      // ignore formatting errors
    }
    return {
      date: format(new Date(endTime * 1000), 'MMM d, yyyy'),
      relative,
    };
  }, [endTime]);

  const displayQ = shortName || question;

  const handleYes = React.useCallback(() => {
    if (!id) return;
    addParlaySelection({
      conditionId: id,
      question: displayQ,
      prediction: true,
    });
  }, [id, displayQ, addParlaySelection]);

  const handleNo = React.useCallback(() => {
    if (!id) return;
    addParlaySelection({
      conditionId: id,
      question: displayQ,
      prediction: false,
    });
  }, [id, displayQ, addParlaySelection]);

  return (
    <div className="border-b last:border-b-0 border-border">
      <div className="bg-card border-muted flex flex-row transition-colors items-stretch relative">
        <div
          className="w-1 min-w-[4px] max-w-[4px]"
          style={{ backgroundColor: color, margin: '-1px 0' }}
        />
        <div className="flex-grow flex flex-col md:flex-row md:items-center md:justify-between px-5 py-4 md:py-3 md:pr-3 gap-3">
          <div className="flex-grow">
            <Dialog>
              <DialogTrigger asChild>
                <button type="button" className="text-left w-full">
                  <div className="text-xl">
                    <span className="underline decoration-1 decoration-foreground/10 underline-offset-4">
                      {question}
                    </span>
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>{displayQ}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {endInfo.date ? (
                    <div className="text-xs text-muted-foreground">
                      Ends {endInfo.date}
                      {endInfo.relative ? (
                        <span> ({endInfo.relative})</span>
                      ) : null}
                    </div>
                  ) : null}
                  {description ? (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {description}
                    </div>
                  ) : null}
                  {Array.isArray(similarMarkets) &&
                  similarMarkets.length > 0 ? (
                    <div className="pt-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Similar Markets
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        {similarMarkets.map((url, i) => (
                          <li key={`${id}-sm-${i}`} className="text-sm">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-muted-foreground hover:text-foreground break-all"
                            >
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center justify-end shrink-0 w-full md:w-auto">
            <YesNoSplitButton
              onYes={handleYes}
              onNo={handleNo}
              className="w-full md:min-w-[10rem]"
              size="lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParlayModeRow;
