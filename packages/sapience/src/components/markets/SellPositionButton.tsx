import { Button } from '@sapience/ui/components/ui/button';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi';
import { useModifyTrade } from '~/hooks/contract/useModifyTrade';

interface SellPositionButtonProps {
  positionId: string | number;
  marketAddress: string;
  chainId: number;
  onSuccess?: () => void;
}

const SellPositionButton = ({
  positionId,
  marketAddress,
  chainId,
  onSuccess,
}: SellPositionButtonProps) => {
  const { toast } = useToast();
  const { abi } = useSapienceAbi();
  const {
    closePosition,
    isClosingPosition,
    isLoading,
    isSuccess,
    isError,
    error,
  } = useModifyTrade({
    marketAddress: marketAddress as `0x${string}`,
    marketAbi: abi,
    chainId,
    positionId: BigInt(positionId),
    enabled: !!marketAddress && !!chainId && positionId !== undefined,
  });

  const successHandled = useRef(false);

  useEffect(() => {
    if (isSuccess && !successHandled.current) {
      successHandled.current = true;
      toast({
        title: 'Success.',
        description: 'Position closed successfully.',
      });
      if (onSuccess) onSuccess();
    }
  }, [isSuccess, onSuccess, toast]);

  useEffect(() => {
    if (isError && error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  }, [isError, error, toast]);

  const handleSell = async () => {
    try {
      await closePosition();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to close position';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleSell}
      disabled={isClosingPosition || isLoading}
    >
      {isClosingPosition || isLoading ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Closing…
        </>
      ) : (
        'Sell'
      )}
    </Button>
  );
};

export default SellPositionButton;
