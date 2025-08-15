'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useSignMessage } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';

import type { MarketType } from '@sapience/ui/types';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

interface PublicToggleButtonProps {
  market: MarketType;
  group: EnrichedMarketGroup;
}

const PublicToggleButton: React.FC<PublicToggleButtonProps> = ({
  market,
  group,
}) => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPublic = market.public ?? true; // Default to true if undefined

  const handleToggle = async () => {
    if (!group.address) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Market group address not found',
      });
      return;
    }

    setIsLoading(true);
    try {
      const timestamp = Math.floor(Date.now() / 1000); // Use seconds, matching API expectation
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG,
      });

      const apiUrl = `${process.env.NEXT_PUBLIC_FOIL_API_URL || ''}/updateMarketPrivacy`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: group.address,
          chainId: group.chainId,
          marketId: market.marketId || market.id,
          signature,
          timestamp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update market privacy');
      }

      toast({
        title: 'Privacy Updated',
        description: `Market is now ${isPublic ? 'private' : 'public'}`,
      });

      // Invalidate relevant queries to refresh the data
      await queryClient.invalidateQueries({
        queryKey: ['marketGroups'],
      });
    } catch (error) {
      console.error('Toggle privacy error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isPublic ? 'default' : 'secondary'} className="text-xs">
        {isPublic ? 'Public' : 'Private'}
      </Badge>
      <Button
        variant="outline"
        size="sm"
        onClick={handleToggle}
        disabled={isLoading}
        className="h-7 px-2"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isPublic ? (
          <>
            <EyeOff className="h-3 w-3 mr-1" />
            <span className="text-xs">Hide</span>
          </>
        ) : (
          <>
            <Eye className="h-3 w-3 mr-1" />
            <span className="text-xs">Show</span>
          </>
        )}
      </Button>
    </div>
  );
};

export default PublicToggleButton;
