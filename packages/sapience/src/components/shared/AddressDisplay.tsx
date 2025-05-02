import { Button } from '@foil/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { useToast } from '@foil/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Wallet } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

// Create a public client for ENS resolution
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Hook to fetch ENS names
const useEnsName = (address: string) => {
  return useQuery({
    queryKey: ['ensName', address],
    queryFn: async () => {
      try {
        if (!address) return null;
        return await publicClient.getEnsName({
          address: address as `0x${string}`,
        });
      } catch (error) {
        console.error('Error fetching ENS name:', error);
        return null;
      }
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
};

interface AddressDisplayProps {
  address: string;
  disableProfileLink?: boolean;
  className?: string;
}

// Constants for the button and icon sizes
const LARGE_BUTTON_SIZE = 'h-8 w-8 p-1';
const SMALL_BUTTON_SIZE = 'h-5 w-5 p-0.5';
const LARGE_ICON_SIZE = 'h-5 w-5';
const SMALL_ICON_SIZE = 'h-3 w-3';

const AddressDisplay = ({
  address,
  disableProfileLink,
  className,
}: AddressDisplayProps) => {
  const { toast } = useToast();
  const { data: ensName } = useEnsName(address);
  const truncatedAddress =
    address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  const displayName = ensName || truncatedAddress;
  const isLarge = className?.includes('text-2xl');

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    toast({
      title: 'Copied to clipboard',
      description: 'Address copied successfully',
      duration: 2000,
    });
  };

  return (
    <div className={`flex items-center gap-3 ${className || ''}`}>
      <span className={`font-mono ${isLarge ? 'text-2xl' : ''}`}>
        {displayName}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          className={isLarge ? LARGE_BUTTON_SIZE : SMALL_BUTTON_SIZE}
          onClick={handleCopy}
        >
          <Copy
            className={`${isLarge ? LARGE_ICON_SIZE : SMALL_ICON_SIZE} text-muted-foreground hover:text-foreground`}
          />
        </Button>

        {!disableProfileLink && (
          <Link href={`/profile/${address}`} className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className={isLarge ? LARGE_BUTTON_SIZE : SMALL_BUTTON_SIZE}
            >
              <Wallet
                className={`${isLarge ? LARGE_ICON_SIZE : SMALL_ICON_SIZE} text-muted-foreground hover:text-foreground`}
              />
            </Button>
          </Link>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={isLarge ? LARGE_BUTTON_SIZE : SMALL_BUTTON_SIZE}
            >
              <ExternalLink
                className={`${isLarge ? LARGE_ICON_SIZE : SMALL_ICON_SIZE} text-muted-foreground hover:text-foreground`}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-30 p-1 flex flex-col gap-0.5">
            <a
              href={`https://app.zerion.io/${address}/history`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <Image src="/zerion.svg" alt="Zerion" width={12} height={12} />
              <span className="font-medium">Zerion</span>
            </a>
            <a
              href={`https://debank.com/profile/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <Image
                src="/debank.svg"
                alt="DeBank"
                width={12}
                height={12}
                className="grayscale brightness-50"
              />
              <span className="font-medium">DeBank</span>
            </a>
            <a
              href={`https://intel.arkm.com/explorer/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <Image
                src="/arkm.svg"
                alt="Arkm Explorer"
                width={12}
                height={12}
              />
              <span className="font-medium">Arkham Intel</span>
            </a>
            <a
              href={`https://blockscan.com/address/${address}#transactions`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded-md hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <Image
                src="/blockscan.svg"
                alt="Blockscan"
                width={12}
                height={12}
              />
              <span className="font-medium">Blockscan</span>
            </a>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export { AddressDisplay, useEnsName };
