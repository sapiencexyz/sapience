import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SlippageTolerance: React.FC = () => {
  const { setValue, watch } = useFormContext();
  const currentSlippage = watch('slippage');

  const handleSlippageChange = (value: number) => {
    setValue('slippage', value.toString(), {
      shouldValidate: false,
    });
  };

  return (
    <div className="mb-5">
      <Label>Slippage Tolerance</Label>
      <div className="flex items-center gap-4 mt-2">
        <Button
          type="button"
          onClick={() => handleSlippageChange(0.1)}
          variant={Number(currentSlippage) === 0.1 ? 'default' : 'outline'}
          size="sm"
        >
          0.1%
        </Button>
        <Button
          type="button"
          onClick={() => handleSlippageChange(0.5)}
          variant={Number(currentSlippage) === 0.5 ? 'default' : 'outline'}
          size="sm"
        >
          0.5%
        </Button>
        <Button
          type="button"
          onClick={() => handleSlippageChange(1.0)}
          variant={Number(currentSlippage) === 1.0 ? 'default' : 'outline'}
          size="sm"
        >
          1.0%
        </Button>
        <div className="relative w-[100px]">
          <Input
            value={currentSlippage}
            onChange={(e) => handleSlippageChange(Number(e.target.value))}
            min={0}
            max={100}
            step={0.1}
            type="number"
            className="pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-500">
            %
          </span>
        </div>
      </div>
    </div>
  );
};

export default SlippageTolerance;
