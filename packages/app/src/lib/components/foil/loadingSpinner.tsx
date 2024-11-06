'use client';

import { Loader2 } from 'lucide-react';

import { useLoading } from '~/lib/context/LoadingContext';

export const LoadingSpinner: React.FC = () => {
  const { isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
    </div>
  );
};
