import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const liquidityFormSchema = z.object({
  depositAmount: z.string().min(1, 'Deposit amount is required'),
  lowPrice: z.string().min(1, 'Low price is required'),
  highPrice: z.string().min(1, 'High price is required'),
  slippage: z.string().default('0.5'),
});

export type LiquidityFormValues = z.infer<typeof liquidityFormSchema>;

export function useLiquidityForm() {
  const form = useForm<LiquidityFormValues>({
    resolver: zodResolver(liquidityFormSchema),
    defaultValues: {
      depositAmount: '0',
      lowPrice: '0',
      highPrice: '0',
      slippage: '0.5',
    },
  });

  // Example of form submission
  function onSubmit(data: LiquidityFormValues) {
    console.log('Liquidity form submission:', data);
    // You could call your contract functions here
  }

  return {
    ...form,
    onSubmit,
  };
} 