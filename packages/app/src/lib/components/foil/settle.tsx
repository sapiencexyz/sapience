import {
  Box,
  Button,
  Text,
  Spinner,
  useToast,
  Heading,
} from '@chakra-ui/react';
import { useState, useEffect, useContext } from 'react';
import { formatUnits, type WriteContractErrorType } from 'viem';
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
    epochSettled,
    settlementPrice,
    collateralAssetTicker,
  } = useContext(MarketContext);
  const { nftId, setNftId, positions } = useAddEditPosition();
  const [withdrawableCollateral, setWithdrawableCollateral] = useState<bigint>(
    BigInt(0)
  );
  const [isSettling, setIsSettling] = useState<boolean>(false);
  const toast = useToast();

  const { isLoadingBalance, isLoadingContracts, refetch } = useTokenIdsOfOwner(
    address as `0x${string}`
  );

  const { data: positionData } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilData.abi,
    functionName: 'getPosition',
    args: [nftId ?? 0],
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
      setNftId(0);
      setWithdrawableCollateral(BigInt(0));
    }
  }, [isConfirmed, toast, refetch, setNftId]);

  useEffect(() => {
    if (positionData) {
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
          args: [BigInt(nftId ?? 0)],
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
    return (
      <Heading size="md" textAlign="center" p={8}>
        Connect your wallet to settle positions
      </Heading>
    );
  }

  if (isLoadingBalance || isLoadingContracts) {
    return (
      <Box textAlign="center">
        <Spinner />
      </Box>
    );
  }

  if (positions?.tradePositions?.length === 0 && positions?.liquidityPositions?.length === 0) {
    return (
      <Heading size="md" textAlign="center" p={8}>
        The connected wallet has no positions in this epoch
      </Heading>
    );
  }

  return (
    <Box>
      <Heading size="md" mb={3}>
        Settle Position
      </Heading>
      <Box mb={4}>
        <PositionSelector />
      </Box>
      {withdrawableCollateral > BigInt(0) && (
        <Box mb={4}>
          <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
            {!(epochSettled && settlementPrice) ? 'Anticipated' : null}{' '}
            Withdrawable Collateral
          </Text>
          <Text fontSize="sm" color="gray.600">
            <NumberDisplay value={formatUnits(withdrawableCollateral, 18)} />{' '}
            {collateralAssetTicker}
          </Text>
        </Box>
      )}
      {epochSettled && settlementPrice ? (
        <>
          <Text mb={4}>
            Settlement Price: {formatUnits(settlementPrice, 18)}
          </Text>
          <Button
            w="100%"
            onClick={handleSettle}
            isLoading={isSettling}
            isDisabled={
              nftId === 0 || isSettling || withdrawableCollateral === BigInt(0)
            }
            variant="brand"
          >
            Settle Position
          </Button>
        </>
      ) : (
        <Button w="100%" isDisabled variant="brand">
          Awaiting settlement price
        </Button>
      )}
    </Box>
  );
}
