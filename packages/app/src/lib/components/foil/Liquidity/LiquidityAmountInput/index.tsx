import { useFormContext } from 'react-hook-form';

import { removeLeadingZeros } from '../../../../util/util';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LiquidityAmountInputProps {
  isEdit: boolean;
  walletBalance: string | null;
  positionCollateralAmount: number;
  collateralAssetTicker: string;
}

const LiquidityAmountInput = ({
  isEdit,
  walletBalance,
  positionCollateralAmount,
  collateralAssetTicker,
}: LiquidityAmountInputProps) => {
  const {
    register,
    setValue,
    formState: { errors },
  } = useFormContext();

  if (isEdit) {
    return (
      <div className={errors.modifyLiquidity ? 'space-y-1' : ''}>
        <Label htmlFor="modifyLiquidity">Modify Liquidity</Label>
        <div className="relative flex">
          <Input
            id="modifyLiquidity"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className="pr-20"
            onWheel={(e) => e.currentTarget.blur()}
            {...register('modifyLiquidity', {
              onChange: (e) => {
                const processed = removeLeadingZeros(e.target.value);
                setValue('modifyLiquidity', processed, {
                  shouldValidate: true,
                });
              },
              onBlur: (e) => {
                if (e.target.value === '') {
                  setValue('modifyLiquidity', '100', {
                    shouldValidate: false,
                    shouldDirty: false,
                    shouldTouch: false,
                  });
                }
              },
              validate: (value) => {
                const percentage = parseFloat(value) / 100;
                const newAmount = positionCollateralAmount * percentage;
                const change = newAmount - positionCollateralAmount;

                return (
                  change <= 0 ||
                  (walletBalance && change <= parseFloat(walletBalance)) ||
                  'Insufficient balance in wallet'
                );
              },
            })}
          />
          <div className="absolute inset-y-0 right-0 flex items-center px-3 border border-l-0 border-input bg-muted">
            %
          </div>
        </div>
        {errors.modifyLiquidity && (
          <p className="text-sm text-destructive">
            {errors.modifyLiquidity.message?.toString()}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor="collateral">Collateral</Label>
      <div className="relative flex mt-2">
        <Input
          id="collateral"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className="pr-20"
          onWheel={(e) => e.currentTarget.blur()}
          {...register('depositAmount', {
            onChange: (e) => {
              const processed = removeLeadingZeros(e.target.value);
              setValue('depositAmount', processed, {
                shouldValidate: true,
              });
            },
            onBlur: (e) => {
              if (e.target.value === '') {
                setValue('depositAmount', '0', {
                  shouldValidate: false,
                  shouldDirty: false,
                  shouldTouch: false,
                });
              }
            },
            validate: (value) => {
              if (value === '' || parseFloat(value) === 0) {
                return 'Amount is required';
              }
              return (
                (walletBalance &&
                  parseFloat(value) <= parseFloat(walletBalance)) ||
                'Insufficient balance in wallet'
              );
            },
          })}
        />
        <div className="absolute inset-y-0 right-0 flex items-center px-3 border border-input bg-muted rounded-r-md">
          {collateralAssetTicker}
        </div>
      </div>
      {errors.depositAmount && (
        <p className="text-sm text-destructive mt-1">
          {errors.depositAmount.message?.toString()}
        </p>
      )}
    </div>
  );
};

export default LiquidityAmountInput;
