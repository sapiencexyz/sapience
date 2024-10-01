import type { ToastId, UseToastOptions } from '@chakra-ui/react';
import type { ReadContractErrorType, WriteContractErrorType } from 'viem';

import { VolumeWindow } from '../interfaces/interfaces';

export const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

export const tickToPrice = (tick: number): number => 1.0001 ** tick;

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

export const renderToast = (
  toast: (options?: UseToastOptions) => ToastId,
  desc: string,
  status?: 'info' | 'warning' | 'success' | 'error' | 'loading'
) => {
  toast({
    title: desc,
    status: status || 'success',
    duration: 5000,
    isClosable: true,
  });
};

export function convertHundredthsOfBipToPercent(
  hundredthsOfBip: number
): number {
  // 1 bip = 0.01%
  // 1 hundredth of bip = 0.01/100 = 0.0001
  return (hundredthsOfBip * 0.0001) / 100;
}

export function getDisplayTextForVolumeWindow(volumeWindow: VolumeWindow) {
  if (volumeWindow === VolumeWindow.H) {
    return 'Past Hour';
  }
  if (volumeWindow === VolumeWindow.D) {
    return 'Past Day';
  }
  if (volumeWindow === VolumeWindow.W) {
    return 'Past Week';
  }
  if (volumeWindow === VolumeWindow.M) {
    return 'Past Month';
  }
  if (volumeWindow === VolumeWindow.Y) {
    return 'Past Year';
  }
  return '';
}
