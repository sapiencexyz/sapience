'use client';

import dynamic from 'next/dynamic';

const Fuzz = dynamic(() => import('../../components/futarchy/Fuzz'), {
  ssr: false,
});

const FutarchyContent = dynamic(
  () => import('../../components/futarchy/FutarchyContent'),
  { ssr: false }
);

const FutarchyPage = () => {
  return (
    <div className="relative h-[100dvh] overflow-hidden w-full flex flex-col justify-center">
      <Fuzz />

      <div className="container max-w-[740px] mx-auto p-4 md:p-8 lg:p-20 flex flex-col justify-center z-10 relative">
        <FutarchyContent />
      </div>
    </div>
  );
};

export default FutarchyPage;
