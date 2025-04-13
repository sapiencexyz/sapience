import { useForm } from 'react-hook-form';

export interface TradeFormValues {
  size: string;
  slippage: string;
  direction: 'Long' | 'Short';
}

export function useTradeForm() {
  const form = useForm<TradeFormValues>({
    defaultValues: {
      size: '0',
      slippage: '0.5',
      direction: 'Long',
    },
  });

  // Register fields with validation
  form.register('size', { 
    required: 'Size is required'
  });
  
  form.register('direction', {
    required: 'Direction is required'
  });

  // Example of form submission
  function onSubmit(data: TradeFormValues) {
    console.log('Trade form submission:', data);
    // You could handle writeContract or other logic here
  }

  return {
    ...form,
    onSubmit,
  };
} 