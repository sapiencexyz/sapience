import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, User } from 'lucide-react';
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
  compact?: boolean;
  showFullAddress?: boolean;
}

// Constants for the button and icon sizes
const LARGE_BUTTON_SIZE = 'h-8 w-8 p-1';
const SMALL_BUTTON_SIZE = 'h-5 w-5 p-0.5';
const XS_BUTTON_SIZE = 'h-4 w-4 p-0';
const LARGE_ICON_SIZE = 'h-5 w-5';
const SMALL_ICON_SIZE = 'h-3 w-3';
const XS_ICON_SIZE = 'h-2.5 w-2.5';

const AddressDisplay = ({
  address,
  disableProfileLink,
  className,
  compact,
  showFullAddress,
}: AddressDisplayProps) => {
  const { toast } = useToast();
  const { data: ensName } = useEnsName(address);
  const truncatedAddress =
    address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;

  const displayName = ensName || (showFullAddress ? address : truncatedAddress);
  const isLarge = className?.includes('text-2xl');
  const isCompact = !!compact;
  const buttonSizeClass = isLarge
    ? LARGE_BUTTON_SIZE
    : isCompact
      ? XS_BUTTON_SIZE
      : SMALL_BUTTON_SIZE;
  const buttonSvgOverrideClass = isCompact ? '[&_svg]:!h-3 [&_svg]:!w-3' : '';
  const iconSizeClass = isLarge
    ? LARGE_ICON_SIZE
    : isCompact
      ? XS_ICON_SIZE
      : SMALL_ICON_SIZE;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    toast({
      title: 'Copied to clipboard',
      description: 'Address copied successfully',
      duration: 2000,
    });
  };

  const containerGapClass = isCompact ? 'gap-1' : 'gap-3';
  const iconsGapClass = isCompact ? 'gap-0.5' : 'gap-1.5';
  const nameTextClass = isLarge
    ? 'text-2xl'
    : isCompact
      ? 'text-xs text-muted-foreground/80'
      : '';

  return (
    <div
      className={`flex items-center ${containerGapClass} ${className || ''}`}
    >
      <span className={`font-mono ${nameTextClass}`}>{displayName}</span>
      <div className={`flex items-center ${iconsGapClass}`}>
        <Button
          variant="ghost"
          size="icon"
          className={`${buttonSizeClass} ${buttonSvgOverrideClass}`}
          onClick={handleCopy}
        >
          <Copy
            className={`${iconSizeClass} text-muted-foreground hover:text-foreground`}
          />
        </Button>

        {!disableProfileLink && (
          <Link href={`/profile/${address}`} className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className={`${buttonSizeClass} ${buttonSvgOverrideClass}`}
            >
              <User
                className={`${iconSizeClass} text-muted-foreground hover:text-foreground`}
              />
            </Button>
          </Link>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`${buttonSizeClass} ${buttonSvgOverrideClass}`}
            >
              <ExternalLink
                className={`${iconSizeClass} text-muted-foreground hover:text-foreground`}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="z-[70] w-30 p-1 flex flex-col gap-0.5">
            <a
              href={`https://app.zerion.io/${address}/history`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
            >
              <Image src="/zerion.svg" alt="Zerion" width={12} height={12} />
              <span className="font-medium">Zerion</span>
            </a>
            <a
              href={`https://debank.com/profile/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-1 rounded hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
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
              className="flex items-center gap-2 p-1 rounded hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
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
              className="flex items-center gap-2 p-1 rounded hover:bg-muted transition-all opacity-80 hover:opacity-100 text-xs"
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
