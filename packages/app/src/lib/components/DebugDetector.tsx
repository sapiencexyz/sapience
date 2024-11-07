'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

const DebugDetectorContent = () => {
  const searchParams = useSearchParams();

  useEffect(() => {
    const debug = searchParams.get('debug');
    if (debug === 'true') {
      document.cookie = 'debug=true; path=/';
    }
  }, [searchParams]);

  return null;
};

export default function DebugDetector() {
  return (
    <Suspense fallback={null}>
      <DebugDetectorContent />
    </Suspense>
  );
}
