import { Badge } from '@foil/ui/components/ui/badge';
import { formatDistanceToNow, fromUnixTime } from 'date-fns';

interface EndTimeDisplayProps {
  endTime?: number | null;
}

const EndTimeDisplay: React.FC<EndTimeDisplayProps> = ({ endTime }) => {
  if (typeof endTime !== 'number') {
    // If endTime is not a number (e.g., null, undefined, or wrong type), show nothing.
    return null;
  }

  try {
    const date = fromUnixTime(endTime);
    const displayTime = formatDistanceToNow(date, { addSuffix: true });
    return <Badge>Ends {displayTime}</Badge>;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return null;
  }
};

export default EndTimeDisplay;
