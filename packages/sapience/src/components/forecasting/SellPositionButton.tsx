import { Button } from '@sapience/ui/components/ui/button';
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
  const { abi } = useSapienceAbi();
  const { closePosition, isClosingPosition, isLoading } = useModifyTrade({
    marketAddress: marketAddress as `0x${string}`,
    marketAbi: abi,
    chainId,
    positionId: BigInt(positionId),
    enabled: !!marketAddress && !!chainId && positionId !== undefined,
  });

  const handleSell = async () => {
    await closePosition();
    if (onSuccess) onSuccess();
  };

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={handleSell}
      disabled={isClosingPosition || isLoading}
    >
      {isClosingPosition || isLoading ? 'Closing…' : 'Sell'}
    </Button>
  );
};

export default SellPositionButton;
