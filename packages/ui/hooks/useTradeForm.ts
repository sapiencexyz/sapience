import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const tradeFormSchema = z.object({
  size: z.string().min(1, 'Size is required'),
  slippage: z.string().default('0.5'),
  direction: z.enum(['Long', 'Short']),
});

export type TradeFormValues = z.infer<typeof tradeFormSchema>;

export function useTradeForm() {
  const form = useForm<TradeFormValues>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: {
      size: '0',
      slippage: '0.5',
      direction: 'Long',
    },
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