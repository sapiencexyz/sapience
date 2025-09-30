'use client';

import React from 'react';
import ForecastsTable from '~/components/profile/ForecastsTable';
import { useForecasts } from '~/hooks/graphql/useForecasts';

export default function FeedForecasts() {
  const { data, isLoading, error, refetch } = useForecasts({});

  // removed debug logging

  React.useEffect(() => {
    // removed debug logging
  }, [data, isLoading, error]);

  return (
    <div className="rounded border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-medium text-muted-foreground">
          Recent Forecasts
        </h2>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
        >
          Refresh
        </button>
      </div>
      <div className="p-2 md:p-4">
        {error ? (
          <div className="px-2 py-3 text-sm text-destructive">
            Failed to load forecasts.
          </div>
        ) : null}
        {isLoading ? (
          <div className="px-2 py-6 text-center text-muted-foreground">
            Loading forecasts...
          </div>
        ) : (
          <ForecastsTable attestations={data} />
        )}
      </div>
    </div>
  );
}
