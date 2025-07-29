'use client';

import { useState } from 'react';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { SquareStack, ChevronRight } from 'lucide-react';
import Link from 'next/link';

// TODO: Define proper type based on requirements
type ParlayPosition = {
  id: string;
  // Add other properties as needed
};

const ParlaysPopover = () => {
  const [parlayPositions, setParlayPositions] = useState<ParlayPosition[]>([]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full px-6"
          size="default"
        >
          <SquareStack className="h-4 w-4" />
          Parlays
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-6 py-14" align="end">
        {parlayPositions.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-base text-muted-foreground">
              Build a wager that combines multiple outcomes.
            </p>
            <Link 
              href="/markets" 
              className="inline-flex items-center text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Browse prediction markets
              <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        ) : (
          // TODO: Render list of ParlayPositions
          <div>
            {/* ParlayPositions list will be implemented here */}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ParlaysPopover; 