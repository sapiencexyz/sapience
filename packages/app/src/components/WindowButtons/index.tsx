import { Button } from '@sapience/ui/components/ui/button';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { TimeWindow } from '~/lib/interfaces/interfaces';

interface WindowSelectorProps {
  setSelectedWindow: Dispatch<SetStateAction<TimeWindow | null>>;
  selectedWindow: TimeWindow | null;
}

const WindowSelector: React.FC<WindowSelectorProps> = ({
  setSelectedWindow,
  selectedWindow,
}) => {
  return (
    <div className="flex gap-1.5">
      {Object.values(TimeWindow).map((window) => (
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
