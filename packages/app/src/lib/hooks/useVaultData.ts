import { useAccount, useReadContract } from 'wagmi';
import useFoilDeployment from '~/components/useFoilDeployment';
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
  // const { data: vaultSymbol } = useReadContract({
  //   abi: vaultData.abi,
  //   address: vaultData.address,
  //   functionName: 'symbol()',
  //   chainId,
  // });

  // console.log('vaultSymbol', vaultSymbol);

  return {
    collateralAsset: collateralAsset as `0x${string}`,
    decimals: Number(decimals || 18),
  };
};
