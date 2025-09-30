'use client';

import LottieLoader from './LottieLoader';

type LoaderWithMessageProps = {
  message?: string;
  className?: string;
  textClassName?: string;
  width?: number | string;
  height?: number | string;
};

export default function LoaderWithMessage({
  message = 'Loading...',
  className = '',
  textClassName = '',
  width = 32,
  height = 32,
}: LoaderWithMessageProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <LottieLoader width={width} height={height} className="opacity-90" />
      <div className={`mt-3 text-sm text-muted-foreground ${textClassName}`}>
        {message}
      </div>
    </div>
  );
}
