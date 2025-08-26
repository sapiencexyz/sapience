'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/ui/components/ui/button';

interface SusdeBalanceProps {
  onClick?: () => void;
}

export default function SusdeBalance({ onClick }: SusdeBalanceProps) {
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];

  const accountAddress = connectedWallet?.address as `0x${string}` | undefined;

  const SUSDE_ADDRESS_ARBITRUM =
    '0xEedD0eD0E6cC8aDC290189236D9645393AE54BC3' as `0x${string}`; // '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2'

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: SUSDE_ADDRESS_ARBITRUM,
    functionName: 'decimals',
    chainId: 42161,
    query: { enabled: Boolean(accountAddress) },
  });

  const { data: balance } = useReadContract({
    abi: erc20Abi,
    address: SUSDE_ADDRESS_ARBITRUM,
    functionName: 'balanceOf',
    args: accountAddress ? [accountAddress] : undefined,
    chainId: 42161,
    query: { enabled: Boolean(accountAddress) },
  });

  const formattedBalance = useMemo(() => {
    try {
      const dec =
        typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
      if (!balance) return `0 testUSDe`;
      const human = formatUnits(balance, dec);
      const num = Number(human);
      if (Number.isNaN(num)) return `0 testUSDe`;
      return `${num.toLocaleString(undefined, { maximumFractionDigits: 4 })} testUSDe`;
    } catch {
      return `0 testUSDe`;
    }
  }, [balance, decimals]);

  return (
    <div className="flex w-fit mx-3 mt-0">
      <Button
        asChild
        variant="outline"
        size="xs"
        className="rounded-full px-3 min-w-[122px] justify-start gap-2 border-black/30 dark:border-white/30"
        onClick={onClick}
      >
        <a
          href="https://swap.defillama.com/?chain=arbitrum&from=&tab=swap&to=0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="/usde.svg"
            alt="USDe"
            width={17}
            height={17}
            className="opacity-90 ml-[-2px]"
          />
          <span className="relative top-[1px]">{formattedBalance}</span>
        </a>
      </Button>
    </div>
  );
}
