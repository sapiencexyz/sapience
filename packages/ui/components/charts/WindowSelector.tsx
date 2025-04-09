import { TimeWindow } from '../../types/charts';
import { Button } from '../ui/button';

interface WindowSelectorProps {
  selectedWindow: TimeWindow | null;
  setSelectedWindow: (window: TimeWindow) => void;
}

export const WindowSelector = ({
  selectedWindow,
  setSelectedWindow,
}: WindowSelectorProps) => {
  return (
    <div className="flex gap-2">
      <Button
        variant={selectedWindow === TimeWindow.D ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedWindow(TimeWindow.D)}
      >
        Day
      </Button>
      <Button
        variant={selectedWindow === TimeWindow.W ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedWindow(TimeWindow.W)}
      >
        Week
      </Button>
      <Button
        variant={selectedWindow === TimeWindow.M ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedWindow(TimeWindow.M)}
      >
        Month
      </Button>
    </div>
  );
};
