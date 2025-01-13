"use client";

import { ArrowUpDown } from "lucide-react";
import { useContext, useState } from "react";
import type { Control, Path, FieldValues } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarketContext } from "~/lib/context/MarketProvider";
import { removeLeadingZeros } from "~/lib/util/util";

interface Props<T extends FieldValues> {
  label: string;
  name: Path<T>;
  control: Control<T>;
  isDisabled?: boolean;
  minAllowedPrice: number;
  maxAllowedPrice: number;
}

const LiquidityPriceInput = <T extends FieldValues>({
  label,
  name,
  control,
  isDisabled = false,
  minAllowedPrice,
  maxAllowedPrice,
}: Props<T>) => {
  const { collateralAssetTicker, stEthPerToken } = useContext(MarketContext);
  const [isGgasWstEth, setIsGgasWstEth] = useState(true);
  const currValue = useWatch({
    control,
    name,
  });
  const ggasWstEthToGasGwei = 1e9 / (stEthPerToken || 1);

  const handleToggleUnit = (
    value: string,
    onChange: (value: string) => void,
  ) => {
    const newInputValue = isGgasWstEth
      ? (Number.parseFloat(value) * ggasWstEthToGasGwei).toString()
      : (Number.parseFloat(value) / ggasWstEthToGasGwei).toString();
    onChange(newInputValue);
    setIsGgasWstEth(!isGgasWstEth);
  };

  const getCurrentUnit = () => {
    return isGgasWstEth ? `Ggas/${collateralAssetTicker}` : "gas/gwei";
  };

  const convertToCurrentUnit = (value: number) => {
    return isGgasWstEth ? value : value * ggasWstEthToGasGwei;
  };

  const getErrorMessage = (value: string) => {
    if (!value) return "Price is required";
    const adjustedMinValue = convertToCurrentUnit(minAllowedPrice);
    const adjustMaxValue = convertToCurrentUnit(maxAllowedPrice);
    const outOfRangeMinError = currValue < adjustedMinValue;
    const outOfRangeMaxError = currValue > adjustMaxValue;
    if (outOfRangeMinError) {
      return `Price cannot be less than ${adjustedMinValue.toFixed(
        2,
      )} ${getCurrentUnit()}`;
    }
    if (outOfRangeMaxError) {
      return `Price cannot exceed ${adjustMaxValue.toFixed(
        2,
      )} ${getCurrentUnit()}`;
    }
    return "";
  };

  return (
    <div className="mb-4">
      <Controller
        name={name}
        control={control}
        rules={{
          required: "Price is required",
          validate: (value) => {
            const errorMessage = getErrorMessage(value);
            return errorMessage || true;
          },
        }}
        render={({
          field: { onChange, value, onBlur },
          fieldState: { error },
        }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="relative flex">
              <Input
                value={value?.toString() || ""}
                onChange={(e) => onChange(removeLeadingZeros(e.target.value))}
                onBlur={() => {
                  if (value === "") {
                    onChange("0");
                  }
                  onBlur();
                }}
                type="number"
                inputMode="decimal"
                disabled={isDisabled}
                onWheel={(e) => e.currentTarget.blur()}
                className="pr-[120px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute right-0 h-full px-3 gap-2 rounded-l-none"
                onClick={() => handleToggleUnit(value, onChange)}
              >
                {getCurrentUnit()}
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </div>
            {error && <FormMessage>{getErrorMessage(value)}</FormMessage>}
          </FormItem>
        )}
      />
    </div>
  );
};

export default LiquidityPriceInput;
