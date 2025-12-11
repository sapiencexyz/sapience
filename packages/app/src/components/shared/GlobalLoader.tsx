'use client';

import dynamic from 'next/dynamic';

import { useLoading } from '~/lib/context/LoadingContext';

// Dynamically import Loader only on the client-side
const Loader = dynamic(() => import('~/components/shared/Loader'), {
  ssr: false,
  // Optional: a minimal placeholder while the loader itself loads
  loading: () => <div className="w-8 h-8" />,
});

const GlobalLoader = () => {
  const { isLoading } = useLoading();

  if (!isLoading) {
    return null; // Don't render anything if not loading
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Loader size={24} />
    </div>
  );
};

export default GlobalLoader;
