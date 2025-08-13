'use client';

import { HydrationBoundary, type DehydratedState } from '@tanstack/react-query';

export default function Hydrate({
  state,
  children,
}: {
  state: DehydratedState;
  children: React.ReactNode;
}) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
