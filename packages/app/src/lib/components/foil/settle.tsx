import { Box, Button, Text, Spinner, useToast } from '@chakra-ui/react';
import { useState, useEffect, useContext } from 'react';
import type { WriteContractErrorType } from 'viem';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import { renderContractErrorToast, renderToast } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';

export default function Settle() {
  const { address, isConnected } = useAccount();

  const {
    address: marketAddress,
    foilData,
    chainId,
    epoch,
  } = useContext(MarketContext);
  const { nftId, setNftId } = useAddEditPosition();
  const [withdrawableCollateral, setWithdrawableCollateral] = useState<bigint>(
    BigInt(0)
  );
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const toast = useToast();

  const { tokenIds, isLoadingBalance, isLoadingContracts, refetch } =
    useTokenIdsOfOwner(address as `0x${string}`);

  const { data: positionData } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilData.abi,
    functionName: 'getPosition',
    args: [nftId],
    chainId,
  });

  const { data: epochData } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilData.abi,
    functionName: 'getEpoch',
    args: [epoch],
    chainId,
  }) as any; // fix

  const { writeContract, data: writeHash } = useWriteContract();

  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeHash,
  });

  useEffect(() => {
    if (isConfirmed) {
      renderToast(toast, 'Position settled successfully!', 'success');
      setIsSettling(false);
      refetch();
      setNftId(0);
      setWithdrawableCollateral(BigInt(0));
    }
  }, [isConfirmed, toast, refetch, setNftId]);

  useEffect(() => {
    if (positionData) {
      console.log('POSITION DATA', positionData);
      setWithdrawableCollateral(
        BigInt((positionData as any).depositedCollateralAmount)
      );
    }
  }, [positionData]);

  const handleSettle = async () => {
    if (nftId !== 0 && foilData) {
      setIsSettling(true);
      try {
        await writeContract({
          address: foilData.address as `0x${string}`,
          abi: foilData.abi,
          functionName: 'settlePosition',
          chainId,
          args: [BigInt(nftId)],
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
      <PositionSelector isLP={null} />
      {withdrawableCollateral > BigInt(0) && (
        <Text mb={4}>
          Withdrawable Collateral:{' '}
          <NumberDisplay value={withdrawableCollateral.toString()} />{' '}
          {foilData.collateralAssetTicker}
        </Text>
      )}
      {epochData.settled ? (
        <Button
          onClick={handleSettle}
          isLoading={isSettling}
          isDisabled={
            nftId === 0 || isSettling || withdrawableCollateral === BigInt(0)
          }
          variant="brand"
        >
          Settle Position
        </Button>
      ) : (
        <Text>Pending settlement...</Text>
      )}
    </Box>
  );
}
