import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { TimeWindow } from '~/lib/interfaces/interfaces';

interface WindowSelectorProps {
  setSelectedWindow: Dispatch<SetStateAction<TimeWindow | null>>;
  selectedWindow: TimeWindow | null;
  isTrade?: boolean;
}

const WindowSelector: React.FC<WindowSelectorProps> = ({
  setSelectedWindow,
  selectedWindow,
  isTrade,
}) => {
  const timeWindows = Object.values(TimeWindow);

  return (
    <div className="flex gap-1.5">
      {timeWindows.map((window) => (
        <Button
          key={window}
          variant={selectedWindow === window ? 'default' : 'outline'}
          onClick={() =>
            setSelectedWindow(selectedWindow === window ? null : window)
          }
          className="px-3 py-1.5 text-sm transition-all"
        >
          {window}
        </Button>
      ))}
    </div>
  );
};

export default WindowSelector;
