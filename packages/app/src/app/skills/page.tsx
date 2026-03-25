'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const SkillsRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/skill');
  }, [router]);
  return null;
};

export default SkillsRedirect;
