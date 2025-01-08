import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

import { removeLeadingZeros } from '../../../../util/util';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const [liquidityAction, setLiquidityAction] = useState<'add' | 'remove'>(
    'add'
  );

  useEffect(() => {
    if (isEdit) {
      setValue('modifyLiquidity', '0', {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [isEdit, setValue]);

  if (isEdit) {
    return (
      <div className="space-y-2">
        <Tabs
          defaultValue="add"
          onValueChange={(value) =>
            setLiquidityAction(value as 'add' | 'remove')
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="add">Add Liquidity</TabsTrigger>
            <TabsTrigger value="remove">Remove Liquidity</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className={errors.modifyLiquidity ? 'space-y-1' : ''}>
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
                    setValue('modifyLiquidity', '0', {
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

                  if (liquidityAction === 'add') {
                    return (
                      (walletBalance && change <= parseFloat(walletBalance)) ||
                      'Insufficient wallet balance'
                    );
                  }
                  return (
                    percentage <= 1 ||
                    'Cannot remove more than 100% of liquidity'
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
        <p className="text-sm text-destructive mt-2">
          {errors.depositAmount.message?.toString()}
        </p>
      )}
    </div>
  );
};

export default LiquidityAmountInput;
