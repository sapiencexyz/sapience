'use client';

import dynamic from 'next/dynamic';

import { useLoading } from '~/lib/context/LoadingContext';

// Dynamically import LottieLoader only on the client-side
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
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
      <LottieLoader width={48} height={48} />
    </div>
  );
};

export default GlobalLoader;
