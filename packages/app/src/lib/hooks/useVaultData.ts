import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '~/lib/erc20abi.json';

type Props = {
  vaultData: {
    abi: any;
    address: `0x${string}`;
  };
};

export const useVaultData = ({ vaultData }: Props) => {
  const { chainId } = useAccount();

  const { data: collateralAsset } = useReadContract({
    abi: vaultData.abi,
    address: vaultData.address,
    functionName: 'collateralAsset',
    chainId,
  });

  const { data: decimals } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'decimals',
    chainId,
    query: {
      enabled: !!collateralAsset,
    },
  });

  const { data: collateralSymbol } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'symbol',
    chainId,
  });

  const { data: epoch } = useReadContract({
    abi: vaultData.abi,
    address: vaultData.address,
    functionName: 'getCurrentEpoch',
    chainId,
  });

  const { data: vaultSymbol } = useReadContract({
    abi: vaultData.abi,
    address: vaultData.address,
    functionName: 'symbol',
    chainId,
  });

  const { data: duration } = useReadContract({
    abi: vaultData.abi,
    address: vaultData.address,
    functionName: 'duration',
    chainId,
  });

  const { data: vaultDecimals } = useReadContract({
    abi: vaultData.abi,
    address: vaultData.address,
    functionName: 'decimals',
    chainId,
  });

  return {
    collateralAsset: collateralAsset as `0x${string}`,
    decimals: Number(decimals || 18),
    vaultDecimals: Number(vaultDecimals || 18),
    epoch: epoch as {
      startTime: bigint;
      endTime: bigint;
      epochId: bigint;
    },
    vaultSymbol: vaultSymbol as string,
    collateralSymbol: collateralSymbol as string,
    duration,
  };
};
