import { Button } from '@foil/ui/components/ui/button';

interface ErrorStateProps {
  error: unknown;
}

export default function ErrorState({ error }: ErrorStateProps) {
  console.error(error);
  return (
    <div className="flex h-96 w-full flex-col items-center justify-center gap-4">
      <p className="text-destructive">Failed to load positions</p>
      <Button onClick={() => window.location.reload()} variant="outline">
        Retry
      </Button>
    </div>
  );
}
