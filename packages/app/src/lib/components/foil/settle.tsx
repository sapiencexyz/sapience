import { Box, Button, Text, Spinner, useToast } from '@chakra-ui/react';
import { useState, useEffect, useContext } from 'react';
import type { WriteContractErrorType } from 'viem';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';

export default function Settle() {
  const { address, isConnected } = useAccount();
  const { foilData, chainId } = useContext(MarketContext);
  const [selectedPositionId, setSelectedPositionId] = useState<number>(0);
  const [withdrawableCollateral, setWithdrawableCollateral] = useState<bigint>(
    BigInt(0)
  );
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const toast = useToast();

  const { tokenIds, isLoadingBalance, isLoadingContracts, refetch } =
    useTokenIdsOfOwner(address as `0x${string}`);

  const { data: positionData } = useReadContract({
    address: foilData.address as `0x${string}`,
    abi: foilData.abi,
    functionName: 'getPosition',
    args: [selectedPositionId],
    chainId,
  });

  const { writeContract, data: writeHash } = useWriteContract();

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      renderToast(toast, 'Position settled successfully!', 'success');
      setIsSettling(false);
      refetch();
      setSelectedPositionId(0);
      setWithdrawableCollateral(BigInt(0));
    }
  }, [isConfirmed, toast, refetch]);

  useEffect(() => {
    if (positionData) {
      setWithdrawableCollateral(BigInt((positionData as any).collateral));
    }
  }, [positionData]);

  const handleSettle = async () => {
    if (selectedPositionId !== 0 && foilData) {
      setIsSettling(true);
      try {
        await writeContract({
          address: foilData.address as `0x${string}`,
          abi: foilData.abi,
          functionName: 'settlePosition',
          chainId,
          args: [BigInt(selectedPositionId)],
        });
      } catch (error) {
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          'Failed to settle position'
        );
        setIsSettling(false);
      }
    }
  };

  if (!isConnected) {
    return <Text>Please connect your wallet to settle positions.</Text>;
  }

  if (isLoadingBalance || isLoadingContracts) {
    return (
      <Box textAlign="center">
        <Spinner />
      </Box>
    );
  }

  return (
    <Box>
      <PositionSelector
        isLP={false}
        onChange={setSelectedPositionId}
        nftIds={tokenIds}
        value={selectedPositionId}
      />
      {withdrawableCollateral > BigInt(0) && (
        <Text mb={4}>
          Withdrawable Collateral:{' '}
          <NumberDisplay value={withdrawableCollateral.toString()} />{' '}
          {foilData.collateralAssetTicker}
        </Text>
      )}
      <Button
        onClick={handleSettle}
        isLoading={isSettling}
        isDisabled={
          selectedPositionId === 0 ||
          isSettling ||
          withdrawableCollateral === BigInt(0)
        }
        variant="brand"
      >
        Settle Position
      </Button>
    </Box>
  );
}
