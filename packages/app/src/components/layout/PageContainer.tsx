'use client';

import type { ReactNode } from 'react';

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Consistent page container wrapper that handles spacing for banner and sticky header.
 * Works correctly on both desktop and mobile.
 * No top padding needed since banner (in document flow) naturally provides spacing.
 */
const PageContainer = ({ children, className = '' }: PageContainerProps) => {
  return (
    <div className={`w-full mx-auto px-4 xl:px-8 2xl:pr-0 ${className}`}>
      {children}
    </div>
  );
};

export default PageContainer;
