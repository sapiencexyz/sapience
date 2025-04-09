'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { Copy } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getEnsName } from 'viem/ens';
import { usePublicClient } from 'wagmi';

const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

interface AddressDisplayProps {
  address: string;
}

const AddressDisplay = ({ address }: AddressDisplayProps) => {
  const publicClient = usePublicClient();
  const [ensName, setEnsName] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    const resolveEns = async () => {
      if (!publicClient) return;
      try {
        const ens = await getEnsName(publicClient, {
          address: address as `0x${string}`,
        });
        if (ens) setEnsName(ens);
      } catch (error) {
        console.error('Error resolving ENS:', error);
      }
    };
    resolveEns();
  }, [address, publicClient]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(address);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 1000);
  };

  return (
    <div className="flex items-center gap-2">
      <span>{ensName || formatAddress(address)}</span>
      <TooltipProvider>
        <Tooltip open={showCopied}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0.5"
              onClick={handleCopy}
            >
              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Copied!</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default AddressDisplay;
