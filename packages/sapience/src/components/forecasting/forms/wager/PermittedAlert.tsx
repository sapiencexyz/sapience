import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@sapience/ui/components/ui/alert';

interface PermittedAlertProps {
  isPermitted: boolean;
}

export default function PermittedAlert({ isPermitted }: PermittedAlertProps) {
  if (isPermitted) return null;

  return (
    <Alert
      variant="destructive"
      className="mb-4 bg-destructive/10 dark:bg-destructive/20 dark:text-red-700 rounded"
    >
      <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
      <AlertDescription>You cannot wager using this app.</AlertDescription>
    </Alert>
  );
}
