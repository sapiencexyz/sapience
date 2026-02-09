'use client';

import Link from 'next/link';
import { format, formatDistanceStrict } from 'date-fns';
import type { AttestationData } from '~/app/og/_forecast-helpers';
import { d18ToPercentage } from '~/app/og/_forecast-helpers';
import { formatPercentChance } from '~/lib/format/percentChance';
import EnsAvatar from '~/components/shared/EnsAvatar';
import ConditionStatus from '~/components/shared/ConditionStatus';
import ShareDialog from '~/components/shared/ShareDialog';
import { Button } from '@sapience/ui/components/ui/button';
import { Share2 } from 'lucide-react';

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
  const shortAttester = `${attester.slice(0, 6)}...${attester.slice(-4)}`;
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

  // Share dialog params
  const oddsStr = percentage !== null ? `${Math.round(percentage)}%` : '';
  const createdTsSec = Math.floor(createdAt.getTime() / 1000);
  const endTsSec = resolutionDate
    ? Math.floor(resolutionDate.getTime() / 1000)
    : null;

  return (
    <div className="space-y-6">
      {/* Question */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Question
        </div>
        <h1 className="text-xl font-semibold text-foreground leading-snug">
          {question}
        </h1>
      </div>

      {/* Prediction */}
      {percentage !== null && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Forecast
          </div>
          <span
            className={`font-mono text-2xl font-bold ${predictionColorClass}`}
          >
            {formatPercentChance(percentage / 100)} chance
          </span>
        </div>
      )}

      {/* Comment */}
      {comment && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Comment
          </div>
          <p className="text-foreground/90 leading-relaxed">{comment}</p>
        </div>
      )}

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border">
        {/* Forecaster */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Forecaster
          </div>
          <Link
            href={`/profile/${attester}`}
            className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
          >
            <EnsAvatar address={attester} width={16} height={16} />
            {shortAttester}
          </Link>
        </div>

        {/* Submitted */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Submitted
          </div>
          <span className="text-sm text-foreground">
            {format(createdAt, 'MMM d, yyyy')}
          </span>
        </div>

        {/* Resolution / Horizon */}
        {resolutionStr && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Resolution
            </div>
            <span className="text-sm text-foreground">{resolutionStr}</span>
          </div>
        )}

        {horizonStr && (
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Horizon
            </div>
            <span className="text-sm text-foreground">{horizonStr}</span>
          </div>
        )}
      </div>

      {/* Status */}
      {serverAttestation.condition && (
        <div className="pt-2 border-t border-border">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Status
          </div>
          <ConditionStatus
            settled={serverAttestation.condition.settled}
            resolvedToYes={serverAttestation.condition.resolvedToYes}
            endTime={endTime}
          />
        </div>
      )}

      {/* Share button */}
      <div className="pt-2 border-t border-border">
        <ShareDialog
          title="Share"
          question={question}
          owner={attester}
          imagePath="/og/forecast"
          forecastUid={uid}
          extraParams={{
            uid,
            res: resolutionStr || '',
            hor: horizonStr || '',
            odds: oddsStr,
            created: String(createdTsSec),
            ...(endTsSec ? { end: String(endTsSec) } : {}),
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Share2 className="mr-1.5 h-4 w-4" />
              Share
            </Button>
          }
        />
      </div>
    </div>
  );
}
