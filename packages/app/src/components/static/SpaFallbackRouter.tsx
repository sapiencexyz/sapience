'use client';

import React, { Suspense, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const QuestionPageClient = React.lazy(
  () => import('~/app/questions/[...parts]/QuestionPageClient')
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

type RouteMatch = { type: 'question'; parts: string[] } | null;

function matchRoute(pathname: string): RouteMatch {
  // Strip trailing slash for matching
  const p = pathname.replace(/\/$/, '') || '/';

  const m = p.match(/^\/questions\/(.+)$/);
  if (m) return { type: 'question', parts: m[1].split('/') };

  return null;
}

export default function SpaFallbackRouter() {
  const pathname = usePathname();
  const match = useMemo(() => matchRoute(pathname), [pathname]);

  if (!match) return <NotFoundContent />;

  return (
    <Suspense fallback={<Loading />}>
      <QuestionPageClient parts={match.parts} />
    </Suspense>
  );
}
