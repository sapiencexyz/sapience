import { useAccount, useReadContract } from 'wagmi';

import erc20ABI from '~/lib/erc20abi.json';

type Props = {
  vaultData?: {
    abi: any;
    address: `0x${string}`;
  } | null;
};

export const useVaultData = ({ vaultData }: Props) => {
  const { chainId } = useAccount();

  const { data: collateralAsset } = useReadContract({
    abi: vaultData?.abi,
    address: vaultData?.address,
    functionName: 'collateralAsset',
    chainId,
    query: {
      enabled: !!vaultData,
    },
  });

  const { data: decimals } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'decimals',
    chainId,
    query: {
      enabled: !!collateralAsset && !!vaultData,
    },
  });

  const { data: collateralSymbol } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'symbol',
    chainId,
    query: {
      enabled: !!collateralAsset && !!vaultData,
    },
  });

  const { data: epoch } = useReadContract({
    abi: vaultData?.abi,
    address: vaultData?.address,
    functionName: 'getCurrentEpoch',
    chainId,
    query: {
      enabled: !!vaultData,
    },
  });

  const { data: vaultSymbol } = useReadContract({
    abi: vaultData?.abi,
    address: vaultData?.address,
    functionName: 'symbol',
    chainId,
    query: {
      enabled: !!vaultData,
    },
  });

  const { data: duration } = useReadContract({
    abi: vaultData?.abi,
    address: vaultData?.address,
    functionName: 'duration',
    chainId,
    query: {
      enabled: !!vaultData,
    },
  });

  const { data: vaultDecimals } = useReadContract({
    abi: vaultData?.abi,
    address: vaultData?.address,
    functionName: 'decimals',
    chainId,
    query: {
      enabled: !!vaultData,
    },
  });

  return {
    collateralAsset: (collateralAsset || '0x') as `0x${string}`,
    decimals: Number(decimals || 18),
    vaultDecimals: Number(vaultDecimals || 18),
    epoch:
      (epoch as {
        startTime: bigint;
        endTime: bigint;
        epochId: bigint;
      }) || null,
    vaultSymbol: (vaultSymbol || '') as string,
    collateralSymbol: (collateralSymbol || '') as string,
    duration: duration || BigInt(0),
  };
};
