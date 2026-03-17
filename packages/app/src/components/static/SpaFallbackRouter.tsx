'use client';

import React, { Suspense, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const PredictionPageClient = React.lazy(
  () => import('~/app/predictions/[predictionId]/PredictionPageClient')
);
const ForecastPageClient = React.lazy(
  () => import('~/app/forecast/[uid]/ForecastPageClient')
);
const QuestionPageClient = React.lazy(
  () => import('~/app/questions/[...parts]/QuestionPageClient')
);
const ProfilePageContent = React.lazy(
  () => import('~/components/profile/pages/ProfilePageContent')
);

const Loading = () => (
  <div className="flex min-h-[50dvh] items-center justify-center">
    <div className="animate-pulse text-muted-foreground">Loading...</div>
  </div>
);

const NotFoundContent = () => (
  <div className="flex min-h-[70dvh] w-full flex-col justify-center">
    <div className="mx-auto w-full">
      <h1 className="mb-3 text-center text-2xl font-bold">404</h1>
      <h2 className="text-center text-xl font-bold">Not found</h2>
    </div>
  </div>
);

type RouteMatch =
  | { type: 'prediction'; id: string }
  | { type: 'forecast'; uid: string }
  | { type: 'question'; parts: string[] }
  | { type: 'profile'; address: string }
  | null;

function matchRoute(pathname: string): RouteMatch {
  // Strip trailing slash for matching
  const p = pathname.replace(/\/$/, '') || '/';

  let m: RegExpMatchArray | null;

  m = p.match(/^\/predictions\/([^/]+)$/);
  if (m) return { type: 'prediction', id: m[1] };

  m = p.match(/^\/forecast\/([^/]+)$/);
  if (m) return { type: 'forecast', uid: m[1] };

  m = p.match(/^\/questions\/(.+)$/);
  if (m) return { type: 'question', parts: m[1].split('/') };

  m = p.match(/^\/profile\/([^/]+)$/);
  if (m) return { type: 'profile', address: m[1] };

  return null;
}

export default function SpaFallbackRouter() {
  const pathname = usePathname();
  const match = useMemo(() => matchRoute(pathname), [pathname]);

  if (!match) return <NotFoundContent />;

  return (
    <Suspense fallback={<Loading />}>
      {match.type === 'prediction' && (
        <PredictionPageClient
          predictionId={match.id}
          serverPrediction={null}
          serverConditions={[]}
        />
      )}
      {match.type === 'forecast' && (
        <ForecastPageClient uid={match.uid} serverAttestation={null} />
      )}
      {match.type === 'question' && <QuestionPageClient parts={match.parts} />}
      {match.type === 'profile' && (
        <ProfilePageContent addressOverride={match.address} />
      )}
    </Suspense>
  );
}
