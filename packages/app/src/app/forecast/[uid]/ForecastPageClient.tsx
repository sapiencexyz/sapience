'use client';

import Link from 'next/link';
import { format, formatDistanceToNow, formatDistanceStrict } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/ui/components/ui/tooltip';
import type { AttestationData } from '~/app/og/_forecast-helpers';
import { d18ToPercentage } from '~/app/og/_forecast-helpers';
import { formatPercentChance } from '~/lib/format/percentChance';
import EnsAvatar from '~/components/shared/EnsAvatar';
import ConditionStatus from '~/components/shared/ConditionStatus';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';

export default function ForecastPageClient({
  uid,
  serverAttestation,
}: {
  uid: string;
  serverAttestation: AttestationData | null;
}) {
  if (!serverAttestation) {
    return (
      <div className="text-center text-muted-foreground">
        Forecast not found.
      </div>
    );
  }

  const question =
    serverAttestation.condition?.question ?? 'Question not available';
  const attester = serverAttestation.attester;
  const createdAt = new Date(serverAttestation.time * 1000);
  const comment = serverAttestation.comment?.trim() || null;

  // Prediction percentage
  let percentage: number | null = null;
  try {
    percentage = d18ToPercentage(serverAttestation.prediction);
  } catch {
    // ignore
  }

  let predictionColorClass = 'text-ethena';
  if (percentage !== null) {
    if (percentage >= 70) predictionColorClass = 'text-yes';
    else if (percentage <= 30) predictionColorClass = 'text-no';
  }

  // Resolution / horizon
  const endTime = serverAttestation.condition?.endTime ?? null;
  const resolutionDate = endTime ? new Date(endTime * 1000) : null;

  const resolutionStr = resolutionDate
    ? format(resolutionDate, 'MMM d, yyyy')
    : null;
  const horizonStr = resolutionDate
    ? formatDistanceStrict(createdAt, resolutionDate)
    : null;

  // Status
  const isSettled = serverAttestation.condition?.settled ?? false;
  const resolvedToYes = serverAttestation.condition?.resolvedToYes;

  return (
    <div className="space-y-4 pt-2">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <h2 className="eyebrow text-foreground">
          Forecast {uid.slice(0, 6)}...{uid.slice(-4)}
        </h2>
        {isSettled ? (
          resolvedToYes ? (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-yes/40 bg-yes/10 text-yes">
              RESOLVED YES
            </span>
          ) : (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-no/40 bg-no/10 text-no">
              RESOLVED NO
            </span>
          )
        ) : (
          <span className="px-1.5 py-0.5 text-xs font-medium rounded-md font-mono border border-foreground/40 bg-foreground/10 text-foreground">
            ACTIVE
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="whitespace-nowrap text-muted-foreground text-xs cursor-default">
                  created {formatDistanceToNow(createdAt, { addSuffix: false })}{' '}
                  ago
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  {createdAt.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short',
                  })}
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Question */}
      <div className="space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
          Question
        </div>
        {serverAttestation.condition ? (
          <ConditionTitleLink
            conditionId={serverAttestation.condition.id}
            resolverAddress={serverAttestation.condition.resolver ?? undefined}
            title={question}
            className="text-base md:text-lg font-medium"
          />
        ) : (
          <h1 className="text-base md:text-lg font-medium text-foreground leading-snug">
            {question}
          </h1>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* Forecaster */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono mb-1">
            Forecaster
          </div>
          <Link
            href={`/profile/${attester}`}
            className="inline-flex items-center gap-1.5 text-sm md:text-base font-medium font-mono text-foreground hover:text-accent-gold transition-colors"
          >
            <EnsAvatar
              address={attester}
              className="shrink-0 rounded-sm ring-1 ring-border/50"
              width={16}
              height={16}
            />
            {`${attester.slice(0, 6)}...${attester.slice(-4)}`}
          </Link>
        </div>

        {/* Prediction */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono mb-1">
            Prediction
          </div>
          {percentage !== null ? (
            <span
              className={`text-sm md:text-base font-medium tabular-nums font-mono ${predictionColorClass}`}
            >
              {formatPercentChance(percentage / 100)} chance
            </span>
          ) : (
            <span className="text-sm md:text-base font-medium tabular-nums text-muted-foreground">
              —
            </span>
          )}
        </div>

        {/* Ends / Status */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono mb-1">
            Ends
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            <ConditionStatus
              settled={isSettled}
              resolvedToYes={resolvedToYes}
              endTime={endTime}
            />
          </span>
        </div>

        {/* Resolution Date */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono mb-1">
            Resolution
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            {resolutionStr ?? '—'}
          </span>
        </div>

        {/* Horizon */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono mb-1">
            Horizon
          </div>
          <span className="text-sm md:text-base font-medium tabular-nums text-foreground">
            {horizonStr ?? '—'}
          </span>
        </div>
      </div>

      {/* Comment */}
      {comment && (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal font-mono">
            Comment
          </div>
          <p className="text-base md:text-lg text-foreground/90 leading-relaxed">
            {comment}
          </p>
        </div>
      )}
    </div>
  );
}
