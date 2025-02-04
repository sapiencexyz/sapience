import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { Button } from '@/components/ui/button';
import { TimeWindow } from '~/lib/interfaces/interfaces';

interface WindowSelectorProps {
  selectedWindow: TimeWindow;
  setSelectedWindow: Dispatch<SetStateAction<TimeWindow | null>>;
}

const WindowSelector: React.FC<WindowSelectorProps> = ({
  selectedWindow,
  setSelectedWindow,
}) => {
  const timeWindows = Object.values(TimeWindow);

  return (
    <div className="flex gap-1.5">
      {timeWindows.map((window) => (
        <Button
          key={window}
          variant={selectedWindow === window ? 'default' : 'outline'}
          onClick={() => setSelectedWindow(window)}
          className="px-3 py-1.5 text-sm transition-all"
        >
          {window}
        </Button>
      ))}
    </div>
  );
};

export default WindowSelector;
