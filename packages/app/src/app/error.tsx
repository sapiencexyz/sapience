'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Error:', error);
  }, [error]);

  if (error.status === 403) {
    return (
      <div className="flex min-h-[70vh] w-full flex-col justify-center">
        <div className="mx-auto w-full max-w-md text-center">
          <h1 className="mb-3 text-center text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            This service is not available in your region.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] w-full flex-col justify-center">
      <div className="mx-auto w-full max-w-md text-center">
        <h1 className="mb-3 text-center text-2xl font-bold">
          Something went wrong
        </h1>
        <p className="text-muted-foreground">
          An unexpected error occurred. Please try again later.
        </p>
      </div>
    </div>
  );
}
