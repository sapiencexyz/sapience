import { useToast } from '@foil/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type React from 'react';
import { useAccount } from 'wagmi';

interface UseSubmitWagerProps {
  // The submit handler passed from the parent, potentially async
  externalHandleSubmit: (
    event: React.FormEvent<HTMLFormElement>
  ) => Promise<void> | void;
}

export function useSubmitWager({ externalHandleSubmit }: UseSubmitWagerProps) {
  const { address } = useAccount();
  const router = useRouter();
  const { toast } = useToast();

  const submitWager = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      // Prevent default form submission if it wasn't already done
      event.preventDefault();

      try {
        // Await the external handler
        await externalHandleSubmit(event); // Pass the event

        // Show toast on success
        toast({
          title: 'Wager Submitted',
          description: 'Your position will appear on your profile shortly.',
          duration: 5000,
        });

        // NOTE: No explicit cleanup needed for timeout here as it runs once
        // If the component could unmount before timeout, cleanup would be needed.
      } catch (error) {
        // Log the error but assume the external handler might show its own specific toast/error
        console.error(
          'Error during wager submission (via useSubmitWager):',
          error
        );
        // Optionally, show a generic error toast *if* the external one doesn't always.
        // toast({
        //   variant: 'destructive',
        //   title: 'Wager Failed',
        //   description: error instanceof Error ? error.message : 'An unexpected error occurred.'
        // });

        // Re-throw the error if the caller needs to know about it
        // throw error;
      }
    },
    [externalHandleSubmit, toast, address, router] // Dependencies
  );

  return { submitWager };
}
