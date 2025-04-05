import { formatNumber } from '~/lib/utils/util';

interface NumberDisplayProps {
  value: number;
  className?: string;
}

const NumberDisplay = ({ value, className }: NumberDisplayProps) => {
  return <span className={className}>{formatNumber(value)}</span>;
};

export default NumberDisplay;
