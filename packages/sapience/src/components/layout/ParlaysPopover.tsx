'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { SquareStack, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

import { useParlayContext } from '~/lib/context/ParlayContext';

const ParlaysPopover = () => {
  const { parlayPositions, removePosition, clearParlay } = useParlayContext();

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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Parlay ({parlayPositions.length})</h3>
              <Button
                variant="ghost"
                size="xs"
                onClick={clearParlay}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear All
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {parlayPositions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-start justify-between p-3 bg-secondary/50 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {position.question}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        position.prediction 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {position.prediction ? 'YES' : 'NO'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Market #{position.marketId}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => removePosition(position.id)}
                    className="ml-2 h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            
            <div className="pt-2 border-t">
              <Button className="w-full" size="sm">
                Place Parlay Wager
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ParlaysPopover; 