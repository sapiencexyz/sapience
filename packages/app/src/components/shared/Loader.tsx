'use client';

interface LoaderProps {
  className?: string;
  size?: number;
}

const Loader = ({ className = '', size = 12 }: LoaderProps) => {
  return (
    <span
      className={`inline-block align-middle rounded-full bg-muted-foreground animate-loader-pulse ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default Loader;
