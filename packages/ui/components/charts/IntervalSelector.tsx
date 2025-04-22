import { TimeInterval } from '../../types/charts';
import { Button } from '../ui/button';

interface IntervalSelectorProps {
  selectedInterval: TimeInterval;
  setSelectedInterval: (interval: TimeInterval) => void;
}

export const IntervalSelector = ({
  selectedInterval,
  setSelectedInterval,
}: IntervalSelectorProps) => {
  return (
    <div className="flex gap-2">
      <Button
        variant={selectedInterval === TimeInterval.I5M ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedInterval(TimeInterval.I5M)}
      >
        5m
      </Button>
      <Button
        variant={selectedInterval === TimeInterval.I15M ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedInterval(TimeInterval.I15M)}
      >
        15m
      </Button>
      <Button
        variant={selectedInterval === TimeInterval.I30M ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedInterval(TimeInterval.I30M)}
      >
        30m
      </Button>
      <Button
        variant={selectedInterval === TimeInterval.I4H ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedInterval(TimeInterval.I4H)}
      >
        4h
      </Button>
      <Button
        variant={selectedInterval === TimeInterval.I1D ? 'default' : 'outline'}
        size="sm"
        onClick={() => setSelectedInterval(TimeInterval.I1D)}
      >
        1d
      </Button>
    </div>
  );
};
