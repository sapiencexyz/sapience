'use client';

interface ComingSoonSkrimProps {
  className?: string;
}

export default function ComingSoonSkrim({ className }: ComingSoonSkrimProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-50 ${className || ''}`}
    >
      <div className="text-center">
        <h2 className="text-xs font-heading font-semibold tracking-wider text-muted-foreground/70">
          COMING SOON
        </h2>
      </div>
    </div>
  );
}
