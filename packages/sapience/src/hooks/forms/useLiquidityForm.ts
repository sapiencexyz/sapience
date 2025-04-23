import { useForm } from 'react-hook-form';

import { formatPrice, priceToTick, tickToPrice } from '~/lib/utils/tickUtils';

export interface LiquidityFormValues {
  depositAmount: string;
  lowPriceInput: string; // User-entered price value
  highPriceInput: string; // User-entered price value
  // These will be set on submit
  lowPriceTick?: number;
  highPriceTick?: number;
  slippage: string;
}

export interface UseLiquidityFormProps {
  lowPriceTick?: number;
  highPriceTick?: number;
  tickSpacing?: number;
  priceDecimals?: number;
}

export function useLiquidityForm({
  lowPriceTick = 0,
  highPriceTick = 0,
  tickSpacing = 200,
  priceDecimals = 6,
}: UseLiquidityFormProps = {}) {
  // Convert initial ticks to price display values
  const initialLowPrice = formatPrice(
    tickToPrice(lowPriceTick, tickSpacing),
    priceDecimals
  );
  const initialHighPrice = formatPrice(
    tickToPrice(highPriceTick, tickSpacing),
    priceDecimals
  );

  const form = useForm<LiquidityFormValues>({
    defaultValues: {
      depositAmount: '0',
      lowPriceInput: initialLowPrice,
      highPriceInput: initialHighPrice,
      slippage: '0.5',
    },
    mode: 'onSubmit', // Only validate on submit
  });

  // Register fields with validation
  form.register('depositAmount', {
    required: 'Deposit amount is required',
    validate: {
      positive: (value) =>
        parseFloat(value) > 0 || 'Amount must be greater than 0',
    },
  });

  form.register('lowPriceInput', {
    required: 'Low price is required',
  });

  form.register('highPriceInput', {
    required: 'High price is required',
  });

  // Helper functions to convert between tick and display values
  const tickToDisplayPrice = (tick: number): string => {
    return formatPrice(tickToPrice(tick, tickSpacing), priceDecimals);
  };

  const displayPriceToTick = (price: string): number => {
    const numPrice = parseFloat(price || '0');
    return priceToTick(numPrice, tickSpacing);
  };

  // Handle form submission with validation
  function handleSubmit(callback: (data: LiquidityFormValues) => void) {
    return form.handleSubmit((data) => {
      try {
        // Convert price inputs to ticks
        const lowPriceValue = parseFloat(data.lowPriceInput);
        const highPriceValue = parseFloat(data.highPriceInput);

        // Validation checks
        if (isNaN(lowPriceValue)) {
          form.setError('lowPriceInput', {
            type: 'validate',
            message: 'Low price must be a valid number',
          });
          return;
        }

        if (isNaN(highPriceValue)) {
          form.setError('highPriceInput', {
            type: 'validate',
            message: 'High price must be a valid number',
          });
          return;
        }

        if (lowPriceValue >= highPriceValue) {
          form.setError('lowPriceInput', {
            type: 'validate',
            message: 'Low price must be less than high price',
          });
          return;
        }

        // Convert to ticks
        const lowTick = priceToTick(lowPriceValue, tickSpacing);
        const highTick = priceToTick(highPriceValue, tickSpacing);

        // Add calculated ticks to form data
        const submissionData = {
          ...data,
          lowPriceTick: lowTick,
          highPriceTick: highTick,
        };

        // Call the callback with the enhanced data
        callback(submissionData);
      } catch (error) {
        console.error('Error processing form submission:', error);
        form.setError('root', {
          type: 'validate',
          message: 'Error processing form submission',
        });
      }
    });
  }

  return {
    ...form,
    handleSubmit,
    tickToDisplayPrice,
    displayPriceToTick,
  };
}
