'use client';

interface PositionValueDisplayProps {
  value: string;
  prediction: 'yes' | 'no';
  className?: string;
}

const PositionValueDisplay = ({ value, prediction, className }: PositionValueDisplayProps) => {
  const isYes = prediction.toLowerCase() === 'yes';
  
  return (
    <div className={`inline-flex items-center gap-2 ${className || ''}`}>
      <span className="text-base text-muted-foreground font-light">Position:</span>
      <span className={`px-2 py-1 rounded text-sm font-medium ${
        isYes 
          ? 'bg-green-50 text-green-700 border border-green-200' 
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}>
        {value} {prediction.charAt(0).toUpperCase() + prediction.slice(1)}
      </span>
    </div>
  );
};

export default PositionValueDisplay; 