import type { ToastId, UseToastOptions } from '@chakra-ui/react';
import type { ReadContractErrorType, WriteContractErrorType } from 'viem';

export const renderContractErrorToast = (
  error: ReadContractErrorType | WriteContractErrorType | null,
  toast: (options?: UseToastOptions) => ToastId,
  desc: string
) => {
  if (error) {
    console.error(desc, error.message);
    toast({
      title: desc,
      description: error.message,
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  }
};

export const renderToastSuccess = (
  toast: (options?: UseToastOptions) => ToastId,
  desc: string
) => {
  toast({
    title: desc,
    status: 'success',
    duration: 5000,
    isClosable: true,
  });
};

export function decimalToFraction(
  decimal: number,
  decimalPlaces?: number
): [number, number] {
  if (Number.isInteger(decimal)) {
    return [decimal, 1];
  }

  const precision = decimalPlaces || 1000000; // Adjust this for more/less precision
  let numerator = Math.round(decimal * precision);
  let denominator = precision;

  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const divisor = gcd(numerator, denominator);

  numerator /= divisor;
  denominator /= divisor;

  return [numerator, denominator];
}
