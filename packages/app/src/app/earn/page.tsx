'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const EarnContent = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/earn/ethereum-gas');
  }, [router]);

  return (
    <div className="flex justify-center items-center py-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
};

const EarnPage = () => {
  return (
    <div className="flex justify-center items-center w-full m-10">
      <EarnContent />
    </div>
  );
};

export default EarnPage;
