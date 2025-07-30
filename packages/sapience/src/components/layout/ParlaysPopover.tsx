'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Switch } from '@sapience/ui/components/ui/switch';
import { SquareStack, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';

import { useParlayContext } from '~/lib/context/ParlayContext';

const ParlaysPopover = () => {
  const {
    parlayPositions,
    removePosition,
    updatePosition,
    isPopoverOpen,
    setIsPopoverOpen,
  } = useParlayContext();

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="rounded-full px-6" size="default">
          <SquareStack className="h-4 w-4" />
          Parlays
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`w-80 ${parlayPositions.length === 0 ? 'p-6 py-14' : 'p-0'}`}
        align="end"
      >
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
          <div className="space-y-4 p-6">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {parlayPositions.map((position) => (
                <div
                  key={position.id}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg border"
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-medium text-foreground truncate">
                      {position.question}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-medium">
                        NO
                      </span>
                      <Switch
                        checked={position.prediction}
                        onCheckedChange={(checked) =>
                          updatePosition(position.id, { prediction: checked })
                        }
                        className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-500"
                      />
                      <span className="text-xs text-muted-foreground font-medium">
                        YES
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => removePosition(position.id)}
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Button className="w-full" size="lg" disabled>
                Quote Unavailable
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ParlaysPopover;
