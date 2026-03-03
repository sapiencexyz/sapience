'use client';

import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext } from 'react';

// Define the type based on the API response
interface PermitResponse {
  permitted: boolean;
}

interface SapienceContextType {
  // Permit data
  permitData: PermitResponse | undefined;
  isPermitLoading: boolean;
  permitError: Error | null;
  refetchPermitData: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<PermitResponse, Error>>;
}

const SapienceContext = createContext<SapienceContextType | undefined>(
  undefined
);

export const SapienceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Permit/geofence check – use the edge route as the single source of truth.
  const {
    data: permitData,
    isLoading: isPermitLoading,
    error: permitError,
    refetch: refetchPermitData,
  } = useQuery<PermitResponse, Error>({
    queryKey: ['permit'],
    /**
     * Only run this query in the browser. On the server we skip it entirely
     * so we don't attempt a relative fetch from a non-window environment.
     * Client-side hydration will run the query immediately.
     */
    enabled: typeof window !== 'undefined',
    queryFn: async (): Promise<PermitResponse> => {
      if (typeof window === 'undefined') {
        // Should not be hit because of enabled flag; defensive fallback.
        return { permitted: true };
      }

      const response = await fetch('/api/permit', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch permit status: ${response.status} ${response.statusText}`
        );
      }

      const json = (await response.json()) as Partial<PermitResponse>;
      return {
        permitted: Boolean(json.permitted),
      };
    },
    staleTime: 5 * 60 * 1000, // cache decision for a short period
    retry: 1,
  });

  return (
    <SapienceContext.Provider
      value={{
        permitData,
        isPermitLoading,
        permitError,
        refetchPermitData,
      }}
    >
      {children}
    </SapienceContext.Provider>
  );
};

export const useSapience = () => {
  const context = useContext(SapienceContext);
  if (context === undefined) {
    throw new Error('useSapience must be used within a SapienceProvider');
  }
  return context;
};
