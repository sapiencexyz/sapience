import { type UseFormReturn } from 'react-hook-form';
import { Form } from '~/components/ui/form';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { removeLeadingZeros } from '~/lib/util/util';
import SizeInput from '../../sizeInput';
import SlippageTolerance from '../../slippageTolerance';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { TradeFormValues } from '../hooks/useTradeState';

interface TradeFormProps {
  form: UseFormReturn<TradeFormValues>;
  option: 'Long' | 'Short';
  setOption: (option: 'Long' | 'Short') => void;
  nftId?: number;
  setSize: (size: bigint) => void;
  positionData?: FoilPosition;
  collateralAssetTicker: string;
  onCollateralAmountChange: (amount: bigint) => void;
  formError?: string;
  onSubmit: (values: any) => Promise<void>;
  children?: React.ReactNode;
}

export function TradeForm({
  form,
  option,
  setOption,
  nftId,
  setSize,
  positionData,
  collateralAssetTicker,
  onCollateralAmountChange,
  formError,
  onSubmit,
  children
}: TradeFormProps) {
  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors }
  } = form;

  const handleTabChange = (value: string) => {
    setOption(value as 'Long' | 'Short');
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <h2 className="text-2xl font-semibold mb-3">Trade</h2>

        {/* Option Tabs */}
        <Tabs
          defaultValue="Long"
          value={option}
          onValueChange={handleTabChange}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">Long</TabsTrigger>
            <TabsTrigger value="Short">Short</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Size Input */}
        <div className="mb-4">
          <div className={errors.size ? 'space-y-1' : ''}>
            <div className="relative flex">
              <SizeInput
                nftId={nftId}
                setSize={(value) => {
                  if (typeof value === 'function') {
                    setSize((value as (prev: bigint) => bigint)(BigInt(0)));
                  } else {
                    setSize(value);
                  }
                }}
                isLong={option === 'Long'}
                positionData={positionData}
                error={formError}
                defaultToGas={false}
                allowCollateralInput
                collateralAssetTicker={collateralAssetTicker}
                onCollateralAmountChange={onCollateralAmountChange}
                {...register('size', {
                  onChange: (e) => {
                    const processed = removeLeadingZeros(e.target.value);
                    setValue('size', processed, {
                      shouldValidate: true,
                    });
                  },
                  validate: (value) => {
                    if (value === '') return 'Size is required';
                    return true;
                  },
                })}
              />
            </div>
            {errors.size && (
              <p className="text-sm text-destructive">
                {errors.size.message?.toString()}
              </p>
            )}
          </div>
        </div>

        {/* Slippage Tolerance */}
        <SlippageTolerance />

        {/* Action Buttons and Additional Content */}
        {children}
      </form>
    </Form>
  );
}