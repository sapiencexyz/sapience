'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { SquareStack, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const ParlaysPopover = () => {
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
      </PopoverContent>
    </Popover>
  );
};

export default ParlaysPopover; 