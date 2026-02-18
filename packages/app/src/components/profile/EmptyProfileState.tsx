'use client';

type EmptyProfileStateProps = {
  className?: string;
};

export default function EmptyProfileState({
  className = '',
}: EmptyProfileStateProps) {
  return (
    <div className={`w-full ${className}`}>
      <p className="text-lg leading-relaxed text-muted-foreground">
        This address has not interacted with Sapience yet.
      </p>
    </div>
  );
}
