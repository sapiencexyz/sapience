import { Button } from '@sapience/sdk/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, User, Vault } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { passiveLiquidityVault } from '@sapience/sdk/contracts';

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
  disablePopover?: boolean;
  hideVaultIcon?: boolean;
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
  disablePopover,
  hideVaultIcon,
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

  // Make the vault icon slightly larger for large, smaller for compact
  const vaultIconSizeClass = isLarge
    ? 'h-6 w-6'
    : isCompact
      ? 'h-3.5 w-3.5'
      : 'h-5 w-5';

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

  // Check if address matches any vault address across all chains
  const isVaultAddress = Object.values(passiveLiquidityVault).some(
    (vault) => vault.address.toLowerCase() === address.toLowerCase()
  );

  return (
    <div
      className={`flex items-center ${containerGapClass} ${className || ''}`}
    >
      <span className={`font-mono ${nameTextClass}`}>{displayName}</span>
      <div className={`flex items-center ${iconsGapClass}`}>
        {isVaultAddress && !hideVaultIcon && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/vaults" className="flex items-center">
                  <Vault
                    className={`${vaultIconSizeClass} text-accent-gold`}
                    strokeWidth={1.25}
                    absoluteStrokeWidth
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <span>
                  This is a{' '}
                  <Link
                    href="/vaults"
                    className="underline underline-offset-2 cursor-pointer"
                  >
                    vault
                  </Link>
                </span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {!disableProfileLink && (
          <Link href={`/profile/${address}`} className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className={`${buttonSizeClass} ${buttonSvgOverrideClass} group/address bg-transparent hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent active:bg-transparent`}
            >
              <User
                className={`${iconSizeClass} text-muted-foreground opacity-80 group-hover/address:text-accent-gold group-hover/address:opacity-100 transition-colors transition-opacity duration-200 ease-in-out`}
              />
            </Button>
          </Link>
        )}

        {!disablePopover && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`${buttonSizeClass} ${buttonSvgOverrideClass} group/address bg-transparent hover:bg-transparent focus:bg-transparent focus-visible:bg-transparent active:bg-transparent data-[state=open]:bg-transparent`}
              >
                <ExternalLink
                  className={`${iconSizeClass} text-muted-foreground opacity-80 group-hover/address:text-accent-gold group-hover/address:opacity-100 transition-colors transition-opacity duration-200 ease-in-out`}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="z-[70] w-30 p-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={handleCopy}
                className="group/address-action flex items-center gap-2 p-1 rounded hover:bg-transparent focus:bg-transparent hover:text-accent-gold focus-visible:text-accent-gold transition-all opacity-80 hover:opacity-100 text-xs"
              >
                <Copy className="h-3 w-3 text-muted-foreground opacity-80 group-hover/address-action:text-accent-gold group-hover/address-action:opacity-100" />
                <span className="font-medium">Copy Address</span>
              </button>
              <a
                href={`https://app.zerion.io/${address}/history`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/address-action flex items-center gap-2 p-1 rounded hover:bg-transparent focus:bg-transparent hover:text-accent-gold focus-visible:text-accent-gold transition-all opacity-80 hover:opacity-100 text-xs"
              >
                <Image
                  src="/zerion.svg"
                  alt="Zerion"
                  width={12}
                  height={12}
                  className="opacity-70 group-hover/address-action:opacity-100 transition-all duration-200 ease-in-out dark:invert dark:brightness-90 group-hover/address-action:[filter:brightness(0)_saturate(100%)_invert(77%)_sepia(33%)_saturate(592%)_hue-rotate(9deg)_brightness(103%)_contrast(94%)]"
                />
                <span className="font-medium">Zerion</span>
              </a>
              <a
                href={`https://debank.com/profile/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/address-action flex items-center gap-2 p-1 rounded hover:bg-transparent focus:bg-transparent hover:text-accent-gold focus-visible:text-accent-gold transition-all opacity-80 hover:opacity-100 text-xs"
              >
                <Image
                  src="/debank.svg"
                  alt="DeBank"
                  width={12}
                  height={12}
                  className="opacity-70 group-hover/address-action:opacity-100 transition-all duration-200 ease-in-out grayscale brightness-50 dark:invert dark:brightness-90 group-hover/address-action:[filter:brightness(0)_saturate(100%)_invert(77%)_sepia(33%)_saturate(592%)_hue-rotate(9deg)_brightness(103%)_contrast(94%)]"
                />
                <span className="font-medium">DeBank</span>
              </a>
              <a
                href={`https://intel.arkm.com/explorer/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/address-action flex items-center gap-2 p-1 rounded hover:bg-transparent focus:bg-transparent hover:text-accent-gold focus-visible:text-accent-gold transition-all opacity-80 hover:opacity-100 text-xs"
              >
                <Image
                  src="/arkm.svg"
                  alt="Arkm Explorer"
                  width={12}
                  height={12}
                  className="opacity-70 group-hover/address-action:opacity-100 transition-all duration-200 ease-in-out dark:invert dark:brightness-90 group-hover/address-action:[filter:brightness(0)_saturate(100%)_invert(77%)_sepia(33%)_saturate(592%)_hue-rotate(9deg)_brightness(103%)_contrast(94%)]"
                />
                <span className="font-medium">Arkham Intel</span>
              </a>
              <a
                href={`https://blockscan.com/address/${address}#transactions`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/address-action flex items-center gap-2 p-1 rounded hover:bg-transparent focus:bg-transparent hover:text-accent-gold focus-visible:text-accent-gold transition-all opacity-80 hover:opacity-100 text-xs"
              >
                <Image
                  src="/blockscan.svg"
                  alt="Blockscan"
                  width={12}
                  height={12}
                  className="opacity-70 group-hover/address-action:opacity-100 transition-all duration-200 ease-in-out dark:invert dark:brightness-90 group-hover/address-action:[filter:brightness(0)_saturate(100%)_invert(77%)_sepia(33%)_saturate(592%)_hue-rotate(9deg)_brightness(103%)_contrast(94%)]"
                />
                <span className="font-medium">Blockscan</span>
              </a>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
};

export { AddressDisplay, useEnsName };
